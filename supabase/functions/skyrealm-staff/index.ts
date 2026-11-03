// SkyRealm staff authorization API.
// Privileged role records are read and written only with the server-side service role.
// User identity is verified with Supabase Auth; user_metadata is never used for authorization.
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

class StaffError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
function routeFor(req: Request): string {
  const url = new URL(req.url);
  const marker = "/functions/v1/skyrealm-staff";
  let path = url.searchParams.get("route") ||
    (url.pathname.startsWith(marker) ? url.pathname.slice(marker.length) : url.pathname) || "/";
  if (!path.startsWith("/")) path = "/" + path;
  return path === "/" && req.method === "GET" ? "/health" : path;
}
function bearer(req: Request): string {
  const value = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(value)) {
    throw new StaffError(401, "NO_SESSION", "Войди в аккаунт SkyRealm.");
  }
  return value.replace(/^Bearer\s+/i, "").trim();
}
async function authenticate(req: Request) {
  const token = bearer(req);
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!response.ok) throw new StaffError(401, "INVALID_SESSION", "Сессия недействительна. Войди снова.");
  const user = await response.json();
  if (!user?.id || !UUID_RE.test(user.id)) {
    throw new StaffError(401, "INVALID_SESSION", "Не удалось подтвердить аккаунт.");
  }
  if (!user.email_confirmed_at && !user.confirmed_at) {
    throw new StaffError(403, "EMAIL_NOT_VERIFIED", "Сначала подтверди почту.");
  }
  return { id: String(user.id) };
}
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > 8_192) {
    throw new StaffError(413, "BODY_TOO_LARGE", "Слишком большой запрос.");
  }
  try {
    const value = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value as Record<string, unknown>;
  } catch {
    throw new StaffError(400, "INVALID_JSON", "Некорректный запрос.");
  }
}
async function db(path: string, init: RequestInit = {}) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let data: unknown = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    console.error("[SkyRealm staff DB]", response.status, path);
    throw new StaffError(503, "STAFF_DATABASE_ERROR", "Сервис прав доступа временно недоступен.");
  }
  return data;
}
async function currentRole(userId: string): Promise<"admin" | "moderator" | "none"> {
  const rows = await db(
    "skyrealm_staff_roles?user_id=eq." + userId +
    "&is_active=eq.true&select=role,expires_at&limit=1"
  ) as Array<{role?: string; expires_at?: string|null}>;
  const entry = Array.isArray(rows) ? rows[0] : undefined;
  if (entry?.expires_at && Date.parse(entry.expires_at) <= Date.now()) return "none";
  const role = entry?.role;
  return role === "admin" || role === "moderator" ? role : "none";
}
async function publicGrantsEnabled(): Promise<boolean> {
  const rows = await db("skyrealm_staff_settings?id=eq.true&select=public_grants_enabled&limit=1") as Array<{public_grants_enabled?: boolean}>;
  return Array.isArray(rows) && rows[0]?.public_grants_enabled === true;
}
async function bootstrapAvailable(): Promise<boolean> {
  const rows = await db("skyrealm_staff_settings?id=eq.true&select=bootstrap_code_hash,bootstrap_claimed_at&limit=1") as Array<{bootstrap_code_hash?: string|null; bootstrap_claimed_at?: string|null}>;
  return Array.isArray(rows) && !!rows[0]?.bootstrap_code_hash && !rows[0]?.bootstrap_claimed_at;
}
async function claimAdminBootstrap(actorId: string, body: Record<string, unknown>) {
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/.test(username) || code.length < 20 || code.length > 80) {
    throw new StaffError(400, "INVALID_BOOTSTRAP", "Укажи своё имя игрока и действительный одноразовый код.");
  }
  const profiles = await db("profiles?username=ilike." + encodeURIComponent(username) + "&select=id,username&limit=2") as Array<{id: string; username: string}>;
  if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0].id !== actorId) {
    throw new StaffError(403, "BOOTSTRAP_SELF_ONLY", "Первоначальный код можно применить только к своему подтверждённому аккаунту.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  const codeHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  const claimed = await db(
    "skyrealm_staff_settings?id=eq.true&bootstrap_claimed_at=is.null&bootstrap_code_hash=eq." + codeHash,
    { method: "PATCH", body: JSON.stringify({ bootstrap_code_hash: null, bootstrap_claimed_at: new Date().toISOString(), public_grants_enabled: false, updated_by: actorId, updated_at: new Date().toISOString() }) }
  ) as Array<{id?: boolean}>;
  if (!Array.isArray(claimed) || claimed.length !== 1) {
    throw new StaffError(403, "BOOTSTRAP_INVALID_OR_USED", "Код неверный или уже использован.");
  }
  await db("skyrealm_staff_roles?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: actorId, role: "admin", is_active: true, granted_by: actorId, expires_at: null, updated_at: new Date().toISOString() }),
  });
  console.info("[SkyRealm staff] one-time admin bootstrap claimed", { actor: actorId });
  return { ok: true, username: profiles[0].username, role: "admin" };
}
async function setPublicGrants(actorId: string, body: Record<string, unknown>) {
  await requireAdmin(actorId);
  if (typeof body.enabled !== "boolean") {
    throw new StaffError(400, "INVALID_SETTING", "Укажи включён или выключен открытый режим выдачи ролей.");
  }
  await db("skyrealm_staff_settings?id=eq.true", {
    method: "PATCH",
    body: JSON.stringify({ public_grants_enabled: body.enabled, updated_by: actorId, updated_at: new Date().toISOString() }),
  });
  console.info("[SkyRealm staff] public grants setting changed", { actor: actorId, enabled: body.enabled });
  return { ok: true, public_grants_enabled: body.enabled };
}
async function grantRole(actorId: string, body: Record<string, unknown>) {
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const role = body.role;
  const action = body.action === "revoke" ? "revoke" : "grant";
  if (!/^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/.test(username) || (role !== "admin" && role !== "moderator")) {
    throw new StaffError(400, "INVALID_ROLE_GRANT", "Проверь имя игрока и выбранную роль.");
  }
  const profiles = await db("profiles?username=ilike." + encodeURIComponent(username) + "&select=id,username&limit=2") as Array<{id: string; username: string}>;
  if (!Array.isArray(profiles) || profiles.length === 0) throw new StaffError(404, "PLAYER_NOT_FOUND", "Игрок с таким именем не найден.");
  if (profiles.length > 1) throw new StaffError(409, "PLAYER_NAME_AMBIGUOUS", "Найдено несколько игроков. Укажи точное имя.");
  const target = profiles[0];
  if (action === "revoke") {
    await requireAdmin(actorId);
    await db("skyrealm_staff_roles?user_id=eq." + target.id, { method: "DELETE" });
    console.info("[SkyRealm staff] role revoked", { actor: actorId, target: target.id });
    return { ok: true, action, username: target.username, role: "player", expires_at: null };
  }
  const duration = body.duration;
  const durations: Record<string, number|null> = { permanent: null, "1h": 60*60*1000, "24h": 24*60*60*1000, "7d": 7*24*60*60*1000, "30d": 30*24*60*60*1000 };
  if (typeof duration !== "string" || !(duration in durations)) throw new StaffError(400, "INVALID_DURATION", "Выбери срок действия роли.");
  if (!await publicGrantsEnabled()) await requireAdmin(actorId);
  const expiresAt = durations[duration] === null ? null : new Date(Date.now() + durations[duration]!).toISOString();
  await db("skyrealm_staff_roles?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: target.id, role, is_active: true, granted_by: actorId, expires_at: expiresAt, updated_at: new Date().toISOString() }),
  });
  console.info("[SkyRealm staff] role granted", { actor: actorId, target: target.id, role, expires_at: expiresAt });
  return { ok: true, action, username: target.username, role, expires_at: expiresAt };
}
async function requireAdmin(userId: string) {
  if (await currentRole(userId) !== "admin") {
    throw new StaffError(403, "STAFF_ADMIN_REQUIRED", "Недостаточно прав администратора.");
  }
}
async function requireStaff(userId: string): Promise<"admin" | "moderator"> {
  const role = await currentRole(userId);
  if (role !== "admin" && role !== "moderator") {
    throw new StaffError(403, "STAFF_REQUIRED", "Эта функция доступна только команде SkyRealm.");
  }
  return role;
}
async function listPlayers() {
  const profiles = await db(
    "profiles?select=id,username,display_name&order=username.asc&limit=500"
  ) as Array<{id: string; username: string; display_name?: string|null}>;
  const roles = await db(
    "skyrealm_staff_roles?select=user_id,role,is_active,expires_at&order=created_at.asc&limit=500"
  ) as Array<{user_id: string; role: string; is_active: boolean; expires_at?: string|null}>;
  const roleByUser = new Map<string,string>();
  for (const row of Array.isArray(roles) ? roles : []) {
    const notExpired = !row.expires_at || Date.parse(row.expires_at) > Date.now();
    if (row.is_active && notExpired && (row.role === "admin" || row.role === "moderator")) {
      roleByUser.set(row.user_id, row.role);
    }
  }
  return (Array.isArray(profiles) ? profiles : []).map(profile => ({
    user_id: profile.id,
    username: profile.username,
    display_name: profile.display_name ?? "",
    role: roleByUser.get(profile.id) ?? "player",
  }));
}
async function setModerator(actorId: string, body: Record<string, unknown>) {
  const targetId = typeof body.user_id === "string" ? body.user_id : "";
  const action = body.action;
  if (!UUID_RE.test(targetId) || (action !== "grant" && action !== "revoke")) {
    throw new StaffError(400, "INVALID_ROLE_CHANGE", "Укажи игрока и действие назначения или снятия модератора.");
  }
  const profiles = await db(
    "profiles?id=eq." + targetId + "&select=id&limit=1"
  ) as Array<{id: string}>;
  if (!Array.isArray(profiles) || profiles.length !== 1) {
    throw new StaffError(404, "PLAYER_NOT_FOUND", "Игрок не найден.");
  }
  const existing = await db(
    "skyrealm_staff_roles?user_id=eq." + targetId + "&select=role,is_active&limit=1"
  ) as Array<{role?: string; is_active?: boolean}>;
  const current = Array.isArray(existing) ? existing[0] : undefined;
  if (current?.role === "admin") {
    throw new StaffError(409, "ADMIN_ROLE_PROTECTED", "Роль администратора нельзя менять из панели модераторов.");
  }
  if (action === "grant") {
    await db("skyrealm_staff_roles?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        user_id: targetId,
        role: "moderator",
        is_active: true,
        granted_by: actorId,
        updated_at: new Date().toISOString(),
      }),
    });
    console.info("[SkyRealm staff] moderator granted", { actor: actorId, target: targetId });
    return { ok: true, action, user_id: targetId, role: "moderator" };
  }
  await db(
    "skyrealm_staff_roles?user_id=eq." + targetId + "&role=eq.moderator",
    { method: "DELETE" }
  );
  console.info("[SkyRealm staff] moderator revoked", { actor: actorId, target: targetId });
  return { ok: true, action, user_id: targetId, role: "player" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    return json({ error: { code: "SERVER_CONFIG", message: "Staff API не настроен." } }, 500);
  }
  const route = routeFor(req);
  if (route === "/health" && req.method === "GET") {
    return json({ status: "ok", service: "skyrealm-staff", version: "3" });
  }
  try {
    const user = await authenticate(req);
    if (route === "/api/staff/me" && req.method === "GET") {
      return json({ ok: true, user_id: user.id, role: await currentRole(user.id), public_grants_enabled: await publicGrantsEnabled(), bootstrap_available: await bootstrapAvailable() });
    }
    if (route === "/api/staff/bootstrap" && req.method === "POST") {
      return json(await claimAdminBootstrap(user.id, await readBody(req)));
    }
    if (route === "/api/staff/settings" && req.method === "GET") {
      return json({ ok: true, role: await currentRole(user.id), public_grants_enabled: await publicGrantsEnabled() });
    }
    if (route === "/api/staff/grants" && req.method === "POST") {
      return json(await grantRole(user.id, await readBody(req)));
    }
    if (route === "/api/staff/settings" && req.method === "POST") {
      return json(await setPublicGrants(user.id, await readBody(req)));
    }
    const role = await requireStaff(user.id);
    if (route === "/api/staff/players" && req.method === "GET") {
      await requireAdmin(user.id);
      return json({ ok: true, players: await listPlayers() });
    }
    if (route === "/api/staff/moderators" && req.method === "POST") {
      await requireAdmin(user.id);
      return json(await setModerator(user.id, await readBody(req)));
    }
    if (route === "/api/staff/capabilities" && req.method === "GET") {
      return json({
        ok: true,
        role,
        capabilities: role === "admin"
          ? ["open_admin_panel", "open_moderator_panel", "manage_moderators"]
          : ["open_moderator_panel"],
      });
    }
    throw new StaffError(404, "NOT_FOUND", "Маршрут не найден.");
  } catch (error) {
    if (error instanceof StaffError) {
      return json({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error("[SkyRealm staff API]", error);
    return json({ error: { code: "INTERNAL_ERROR", message: "Внутренняя ошибка проверки прав." } }, 500);
  }
});
