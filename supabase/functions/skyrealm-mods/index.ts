import JSZip from "npm:jszip@3.10.1";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "skyrealm-community-mods";
const MAX_ARCHIVE = 20 * 1024 * 1024;
const MAX_UNPACKED = 12 * 1024 * 1024;
const MAX_SOURCE = 14_000;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}
function error(message: string, status = 400) {
  return json({ ok: false, message }, status);
}
async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(data?.message || data?.details || "Database request failed (" + response.status + ")");
  return data;
}
async function getUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: ANON_KEY, Authorization: auth },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}
function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";
}
function safePath(path: string) {
  return !!path && !path.startsWith("/") && !path.includes("\\") &&
    path.split("/").every((part) => part && part !== "." && part !== "..") &&
    !path.includes(":");
}
function validId(value: unknown) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{1,127}$/i.test(value);
}
async function validateArchive(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const files = Object.values(zip.files).filter((entry: any) => !entry.dir) as any[];
  if (!files.length || files.length > 80) throw new Error("В архиве должно быть от 1 до 80 файлов.");
  let total = 0;
  for (const entry of files) {
    if (!safePath(entry.name)) throw new Error("В архиве найден недопустимый путь файла.");
    const ext = entry.name.toLowerCase().split(".").pop() || "";
    if (!["json", "js", "mjs", "py", "md", "txt", "png", "jpg", "jpeg", "webp", "svg"].includes(ext)) {
      throw new Error("Недопустимый тип файла в архиве: " + ext);
    }
    const size = Number(entry._data?.uncompressedSize || 0);
    total += size;
    if (total > MAX_UNPACKED) throw new Error("Распакованный размер мода превышает 12 МБ.");
    if ((entry._data?.unixPermissions & 0o170000) === 0o120000) {
      throw new Error("Символические ссылки в модах запрещены.");
    }
  }
  const manifestFile = zip.file("mod.json");
  if (!manifestFile) throw new Error("В архиве отсутствует mod.json.");
  const manifestText = await manifestFile.async("string");
  if (manifestText.length > 16_000) throw new Error("Файл mod.json слишком большой.");
  let manifest: any;
  try { manifest = JSON.parse(manifestText); } catch { throw new Error("Файл mod.json содержит некорректный JSON."); }
  if (!manifest || typeof manifest !== "object" || !validId(manifest.id)) throw new Error("В mod.json указан некорректный ID мода.");
  const name = cleanText(manifest.name, 48);
  const description = cleanText(manifest.description, 500);
  const version = cleanText(manifest.version || "1.0.0", 40);
  const entry = cleanText(manifest.entry, 180);
  if (!name || description.length < 10 || !version || !safePath(entry)) throw new Error("Заполни в mod.json название, описание (от 10 символов), версию и entry.");
  const ext = entry.toLowerCase().split(".").pop();
  const language = ext === "py" ? "python" : (ext === "js" || ext === "mjs" ? "javascript" : "");
  if (!language) throw new Error("Главный файл должен быть JavaScript (.js/.mjs) или Python (.py).");
  const entryFile = zip.file(entry);
  if (!entryFile) throw new Error("Главный файл из поля entry не найден в архиве.");
  const source = await entryFile.async("string");
  if (source.length < 10 || source.length > MAX_SOURCE) throw new Error("Главный файл должен содержать от 10 до 14 000 символов.");
  const signature = language === "python" ? /def\s+on_tick\s*\(/ : /function\s+onTick\s*\(/;
  if (!signature.test(source)) throw new Error(language === "python" ? "В Python-моде нужна функция on_tick(context, state)." : "В JavaScript-моде нужна функция onTick(context, state).");
  return { id: manifest.id, name, description, version, language };
}
async function listMods(url: URL) {
  const search = cleanText(url.searchParams.get("q"), 80);
  const category = cleanText(url.searchParams.get("category"), 24);
  let path = "skyrealm_mod_releases?select=id,creator_name,mod_id,name,description,version,game_version,language,category,sha256,file_size,downloads,created_at&status=eq.published&order=created_at.desc&limit=100";
  if (category && ["adventure","building","combat","interface","resources","other"].includes(category)) path += "&category=eq." + encodeURIComponent(category);
  if (search) path += "&or=(" + encodeURIComponent("name.ilike.*" + search + "*,description.ilike.*" + search + "*") + ")";
  const rows = await db(path);
  return json({ ok: true, mods: (rows || []).map((row: any) => ({
    ...row,
    download_url: SUPABASE_URL + "/functions/v1/skyrealm-mods?download=" + row.id,
  })) });
}
async function uploadMod(req: Request) {
  const user = await getUser(req);
  if (!user) return error("Войди в аккаунт SkyRealm, чтобы опубликовать мод.", 401);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return error("Выбери ZIP-архив мода.");
  if (file.size < 22 || file.size > MAX_ARCHIVE) return error("ZIP-архив должен быть не больше 20 МБ.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return error("Файл не похож на ZIP-архив.");
  let meta: any;
  try { meta = await validateArchive(bytes); } catch (err) { return error(String((err as Error).message || err)); }
  const categoryRaw = cleanText(form.get("category"), 24);
  const category = ["adventure","building","combat","interface","resources","other"].includes(categoryRaw) ? categoryRaw : "other";
  const profile = await db("profiles?select=username&id=eq." + encodeURIComponent(user.id));
  const creatorName = cleanText(profile?.[0]?.username || user.user_metadata?.username || "Игрок", 24) || "Игрок";
  const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = Array.from(sha).map((value) => value.toString(16).padStart(2, "0")).join("");
  const storagePath = user.id + "/" + meta.id.replace(/[^a-z0-9._:-]/gi, "_") + "/" + meta.version.replace(/[^a-z0-9._-]/gi, "_") + ".zip";
  const storageResponse = await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + storagePath, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/zip",
      "x-upsert": "true",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: bytes,
  });
  if (!storageResponse.ok) {
    const message = await storageResponse.text();
    return error("Не удалось сохранить архив: " + message.slice(0, 220), 502);
  }
  const row = {
    creator_id: user.id, creator_name: creatorName, mod_id: meta.id, name: meta.name,
    description: meta.description, version: meta.version, game_version: "0.20.50.90",
    language: meta.language, category, storage_path: storagePath,
    sha256, file_size: bytes.length, status: "published",
  };
  const saved = await db("skyrealm_mod_releases?on_conflict=creator_id,mod_id,version", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([row]),
  });
  return json({ ok: true, mod: saved?.[0] || row, message: "Мод опубликован в общем каталоге SkyRealm." }, 201);
}
async function downloadMod(url: URL) {
  const id = url.searchParams.get("download") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error("Не указан корректный ID мода.");
  const rows = await db("skyrealm_mod_releases?select=id,storage_path,downloads&status=eq.published&id=eq." + encodeURIComponent(id) + "&limit=1");
  const row = rows?.[0];
  if (!row) return error("Мод не найден или снят с публикации.", 404);
  await db("skyrealm_mod_releases?id=eq." + encodeURIComponent(id), {
    method: "PATCH", body: JSON.stringify({ downloads: Number(row.downloads || 0) + 1 }),
  });
  return new Response(null, {
    status: 302,
    headers: { ...CORS, Location: SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + row.storage_path },
  });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return error("Сервер каталога модов не настроен.", 500);
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.searchParams.has("download")) return await downloadMod(url);
    if (req.method === "GET") return await listMods(url);
    if (req.method === "POST") return await uploadMod(req);
    return error("Метод не поддерживается.", 405);
  } catch (err) {
    return error(String((err as Error)?.message || "Внутренняя ошибка каталога."), 500);
  }
});
