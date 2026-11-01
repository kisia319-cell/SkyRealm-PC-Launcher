// SkyRealm Auth API — uses Supabase Auth for password security and OTP email verification.
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
function fail(status: number, message: string, code = "", email = "") {
  return json({ detail: { message, code, email } }, status);
}
function publicUser(user: any) {
  return {
    id: user?.id ?? "",
    username: user?.user_metadata?.username ?? user?.raw_user_meta_data?.username ?? "",
    email: user?.email ?? "",
    created_at: user?.created_at ?? "",
  };
}
async function readJson(req: Request, maxBytes = 64_000): Promise<any> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    const error: any = new Error("Размер облачного архива превышает допустимый лимит.");
    error.status = 413;
    error.code = "CLOUD_SAVE_TOO_LARGE";
    throw error;
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
async function cloudSaveDb(path: string, init: RequestInit = {}) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const error: any = new Error(data?.message || "Cloud save database error.");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
function validateCloudBundle(input: any) {
  if (!input || typeof input !== "object" || Array.isArray(input) || input.format !== 1 ||
      !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 52) return null;
  const allowedKey = (key: string) =>
    key === "skyrealm_worlds_v1" || key === "skyrealm_game_save_v1" ||
    /^skyrealm_game_save_v2_[A-Za-z0-9_-]{1,64}$/.test(key);
  const seen = new Set<string>();
  const items: {key:string;value:string}[] = [];
  let totalBytes = 0;
  for (const raw of input.items) {
    if (!raw || typeof raw !== "object" || typeof raw.key !== "string" ||
        typeof raw.value !== "string" || !allowedKey(raw.key) || seen.has(raw.key)) return null;
    seen.add(raw.key);
    const size = new TextEncoder().encode(raw.value).byteLength;
    totalBytes += size;
    if (size > 1_500_000 || totalBytes > 1_800_000) return null;
    let parsed: any;
    try { parsed = JSON.parse(raw.value); } catch { return null; }
    if (raw.key === "skyrealm_worlds_v1") {
      if (!Array.isArray(parsed) || parsed.length > 50 ||
          parsed.some((world:any) => !world || typeof world !== "object" ||
            typeof world.id !== "string" || typeof world.name !== "string" ||
            world.id.length > 64 || world.name.length > 32)) return null;
    } else if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    items.push({key:raw.key,value:raw.value});
  }
  if (!seen.has("skyrealm_worlds_v1") && !seen.has("skyrealm_game_save_v1")) return null;
  return {format:1,items,created_at:typeof input.created_at==="string" ? input.created_at.slice(0,40) : new Date().toISOString()};
}
async function authRequest(path: string, method = "GET", body?: unknown, accessToken?: string) {
  const headers: Record<string, string> = {
    "apikey": ANON_KEY,
    "Authorization": "Bearer " + (accessToken || ANON_KEY),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(SUPABASE_URL + "/auth/v1/" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const message = data.msg || data.message || data.error_description || data.error || ("Auth service returned " + response.status);
    const error: any = new Error(message);
    error.status = response.status;
    error.code = data.code || data.error_code || "";
    error.data = data;
    throw error;
  }
  return data;
}
async function profileQuery(query: string) {
  if (!SERVICE_KEY) throw new Error("Cloud profile service is not configured.");
  const response = await fetch(SUPABASE_URL + "/rest/v1/profiles?" + query, {
    headers: { "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY },
  });
  if (!response.ok) throw new Error("Profile lookup failed (" + response.status + ")");
  return await response.json();
}
function authError(err: any, email = "") {
  const msg = String(err?.message || "");
  const lower = msg.toLowerCase();
  if (lower.includes("already") || lower.includes("registered") || lower.includes("duplicate")) {
    return fail(409, "Этот адрес почты или имя игрока уже используется.", "ACCOUNT_EXISTS", email);
  }
  if (lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
    return fail(403, "Сначала подтверди электронную почту кодом из письма.", "EMAIL_NOT_VERIFIED", email);
  }
  if (lower.includes("token has expired or is invalid") || (lower.includes("token") && lower.includes("invalid"))) {
    return fail(400, "Код недействителен или уже истёк. Запроси новый код и введи его полностью.", "INVALID_OR_EXPIRED_CODE", email);
  }
  if (lower.includes("invalid login credentials") || lower.includes("invalid email or password")) {
    return fail(401, "Неверная почта/логин или пароль.", "INVALID_CREDENTIALS", email);
  }
  if (lower.includes("weak password") || lower.includes("password should")) {
    return fail(400, "Пароль должен содержать минимум 8 символов.", "INVALID_PASSWORD", email);
  }
  if (err?.status === 429) return fail(429, "Слишком много запросов. Подожди немного и попробуй снова.", "RATE_LIMITED", email);
  if (err?.status >= 500) return fail(503, "Сервис авторизации временно недоступен. Проверь настройки почты в Supabase.", "AUTH_SERVICE_UNAVAILABLE", email);
  return fail(Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : 400, msg || "Не удалось выполнить запрос.", err?.code || "", email);
}
function validUsername(value: unknown) {
  return typeof value === "string" && /^[A-Za-zА-Яа-яЁё0-9_]{3,20}$/.test(value);
}
function validEmail(value: unknown) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    return fail(500, "Cloud API is not configured. Check Supabase function environment variables.", "SERVER_CONFIG");
  }

  const url = new URL(req.url);
  const marker = "/functions/v1/skyrealm-auth";
  const rawPath = url.pathname.startsWith(marker) ? url.pathname.slice(marker.length) : url.pathname;
  // Some edge gateways normalize the function URL and discard extra path segments.
  // The client therefore sends its desired endpoint explicitly via ?route=/api/auth/...
  let path = url.searchParams.get("route") || rawPath || "/";
  if (!path.startsWith("/")) path = "/" + path;
  const payload = req.method === "POST" ? await readJson(req, path === "/api/cloud/save" ? 2_000_000 : 64_000) : {};
  if ((path === "/" || path === "") && req.method === "GET") path = "/health";
  if (path === "/health" && req.method === "GET") {
    return json({ status: "ok", service: "skyrealm-auth", version: "1.0.2" });
  }
  try {
    if (path === "/api/cloud/save" && req.method === "GET") {
      const authorization = req.headers.get("Authorization") || "";
      if (!authorization.toLowerCase().startsWith("bearer ")) return fail(401, "Войди в аккаунт для облачных сохранений.", "NO_SESSION");
      const token = authorization.slice(7).trim();
      const verified = await authRequest("user", "GET", undefined, token);
      const userId = String(verified?.id || "");
      if (!userId || (!verified.email_confirmed_at && !verified.confirmed_at)) {
        return fail(403, "Сначала подтверди почту.", "EMAIL_NOT_VERIFIED");
      }
      const rows = await cloudSaveDb("skyrealm_cloud_saves?select=revision,payload,updated_at&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      return json({save: rows?.[0] || null});
    }
    if (path === "/api/cloud/save" && req.method === "POST") {
      const authorization = req.headers.get("Authorization") || "";
      if (!authorization.toLowerCase().startsWith("bearer ")) return fail(401, "Войди в аккаунт для облачных сохранений.", "NO_SESSION");
      const token = authorization.slice(7).trim();
      const verified = await authRequest("user", "GET", undefined, token);
      const userId = String(verified?.id || "");
      if (!userId || (!verified.email_confirmed_at && !verified.confirmed_at)) {
        return fail(403, "Сначала подтверди почту.", "EMAIL_NOT_VERIFIED");
      }
      const expected = Number(payload.expected_revision);
      const bundle = validateCloudBundle(payload.bundle);
      if (!Number.isSafeInteger(expected) || expected < 0 || !bundle) {
        return fail(400, "Архив миров повреждён или содержит недопустимые данные.", "INVALID_CLOUD_SAVE");
      }
      const existing = await cloudSaveDb("skyrealm_cloud_saves?select=revision&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const currentRevision = existing?.length ? Number(existing[0].revision) : 0;
      if (currentRevision !== expected) {
        return json({detail:{message:"Облачная копия изменилась на другом устройстве. Сначала обнови сведения об облачном архиве.",code:"CLOUD_SAVE_CONFLICT",revision:currentRevision}},409);
      }
      const updatedAt = new Date().toISOString();
      let saved: any[] = [];
      if (currentRevision === 0) {
        try {
          saved = await cloudSaveDb("skyrealm_cloud_saves", {method:"POST",body:JSON.stringify({user_id:userId,revision:1,payload:bundle,updated_at:updatedAt})});
        } catch (error:any) {
          if (error?.status === 409 || error?.status === 400) {
            return json({detail:{message:"Архив уже создан на другом устройстве. Обнови сведения и попробуй ещё раз.",code:"CLOUD_SAVE_CONFLICT"}},409);
          }
          throw error;
        }
      } else {
        saved = await cloudSaveDb("skyrealm_cloud_saves?user_id=eq." + encodeURIComponent(userId) + "&revision=eq." + currentRevision, {
          method:"PATCH",body:JSON.stringify({revision:currentRevision+1,payload:bundle,updated_at:updatedAt})
        });
        if (!saved?.length) return json({detail:{message:"Архив уже изменён на другом устройстве. Обнови сведения и попробуй ещё раз.",code:"CLOUD_SAVE_CONFLICT"}},409);
      }
      return json({save:saved[0] || {revision:currentRevision+1,payload:bundle,updated_at:updatedAt},message:"Облачная копия сохранена."});
    }
    if (path === "/api/auth/register" && req.method === "POST") {
      const usernameRaw = typeof payload.username === "string" ? payload.username.trim() : "";
      const username = usernameRaw.toLocaleLowerCase("ru-RU");
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      const password = typeof payload.password === "string" ? payload.password : "";
      if (!validUsername(username)) {
        return fail(400, "Имя игрока должно содержать 3–20 символов: буквы, цифры или подчёркивание.", "INVALID_USERNAME", email);
      }
      if (!validEmail(email)) return fail(400, "Укажи корректный адрес электронной почты.", "INVALID_EMAIL", email);
      if (password.length < 8 || password.length > 128) return fail(400, "Пароль должен содержать от 8 до 128 символов.", "INVALID_PASSWORD", email);

      const existingName = await profileQuery("select=id&username=eq." + encodeURIComponent(username) + "&limit=1");
      if (existingName.length) return fail(409, "Это имя игрока уже используется. Выбери другое.", "USERNAME_EXISTS", email);
      const existingEmail = await profileQuery("select=id&email=eq." + encodeURIComponent(email) + "&limit=1");
      if (existingEmail.length) return fail(409, "Этот адрес почты уже зарегистрирован. Попробуй войти.", "ACCOUNT_EXISTS", email);

      await authRequest("signup", "POST", { email, password, data: { username } });
      return json({
        message: "Проверь почту " + email + ": там должен быть шестизначный код подтверждения.",
        email,
        expires_in_seconds: 600,
      }, 202);
    }

    if (path === "/api/auth/verify" && req.method === "POST") {
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      const code = typeof payload.code === "string" ? payload.code.replace(/\D/g, "") : "";
      if (!validEmail(email) || !/^\d{6,10}$/.test(code)) return fail(400, "Введи корректную почту и полный код из письма (от 6 до 10 цифр).", "INVALID_CODE", email);
      const data = await authRequest("verify", "POST", { email, token: code, type: "signup" });
      if (!data.access_token || !data.user) return fail(400, "Код не принят. Проверь его и попробуй снова.", "INVALID_CODE", email);
      return json({
        message: "Почта успешно подтверждена.",
        access_token: data.access_token,
        refresh_token: data.refresh_token || "",
        expires_in: data.expires_in || 3600,
        token_type: data.token_type || "bearer",
        user: publicUser(data.user),
      });
    }

    if (path === "/api/auth/resend" && req.method === "POST") {
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      if (!validEmail(email)) return fail(400, "Укажи корректный адрес электронной почты.", "INVALID_EMAIL", email);
      await authRequest("resend", "POST", { email, type: "signup" });
      return json({ message: "Если аккаунт ожидает подтверждения, новый код отправлен. Проверь почту и папку «Спам»." });
    }

    if (path === "/api/auth/forgot-password" && req.method === "POST") {
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      if (!validEmail(email)) return fail(400, "Укажи корректный адрес электронной почты.", "INVALID_EMAIL", email);
      await authRequest("recover", "POST", { email });
      return json({ message: "Если для этого адреса доступно восстановление, письмо отправлено. Проверь входящие и папку «Спам»." });
    }

    if (path === "/api/auth/reset-password" && req.method === "POST") {
      const password = typeof payload.password === "string" ? payload.password : "";
      let accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
      if (password.length < 8 || password.length > 128) {
        return fail(400, "Пароль должен содержать от 8 до 128 символов.", "INVALID_PASSWORD");
      }
      if (accessToken.length > 4096) {
        return fail(400, "Ссылка восстановления недействительна или устарела. Запроси новое письмо.", "INVALID_RECOVERY_TOKEN");
      }
      if (!accessToken) {
        const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
        const code = typeof payload.code === "string" ? payload.code.replace(/\\D/g, "") : "";
        if (!validEmail(email) || !/^\\d{6,10}$/.test(code)) {
          return fail(400, "Введи почту и полный код восстановления из письма.", "INVALID_RECOVERY_CODE", email);
        }
        const verified = await authRequest("verify", "POST", { email, token: code, type: "recovery" });
        accessToken = typeof verified.access_token === "string" ? verified.access_token : "";
        if (!accessToken) return fail(400, "Код восстановления недействителен или истёк. Запроси новое письмо.", "INVALID_RECOVERY_CODE", email);
      }
      const data = await authRequest("user", "PUT", { password }, accessToken);
      return json({ message: "Пароль успешно изменён.", user: publicUser(data.user) });
    }

    if (path === "/api/auth/login" && req.method === "POST") {
      const identifier = typeof payload.identifier === "string" ? payload.identifier.trim() : "";
      const password = typeof payload.password === "string" ? payload.password : "";
      if (identifier.length < 3 || password.length < 1) return fail(400, "Введи почту или имя игрока и пароль.", "INVALID_LOGIN");
      let email = identifier.toLowerCase();
      if (!email.includes("@")) {
        const matches = await profileQuery("select=email&username=eq." + encodeURIComponent(identifier.toLocaleLowerCase("ru-RU")) + "&limit=1");
        if (!matches.length) return fail(401, "Неверная почта/логин или пароль.", "INVALID_CREDENTIALS");
        email = matches[0].email;
      }
      try {
        const data = await authRequest("token?grant_type=password", "POST", { email, password });
        return json({
          access_token: data.access_token,
          refresh_token: data.refresh_token || "",
          token_type: data.token_type || "bearer",
          expires_in: data.expires_in || 3600,
          user: publicUser(data.user),
        });
      } catch (err) {
        const msg = String((err as any)?.message || "").toLowerCase();
        if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
          return fail(403, "Этот аккаунт ещё не подтверждён. Введи код из письма или запроси новый.", "EMAIL_NOT_VERIFIED", email);
        }
        throw err;
      }
    }

    if (path === "/api/auth/refresh" && req.method === "POST") {
      const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : "";
      if (!refreshToken || refreshToken.length > 4096) return fail(401, "Сессия устарела. Войди в аккаунт снова.", "NO_SESSION");
      const data = await authRequest("token?grant_type=refresh_token", "POST", { refresh_token: refreshToken });
      if (!data.access_token || !data.refresh_token || !data.user) return fail(401, "Не удалось обновить сессию. Войди снова.", "NO_SESSION");
      return json({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in || 3600,
        token_type: data.token_type || "bearer",
        user: publicUser(data.user),
      });
    }

    if (path === "/api/auth/me" && req.method === "GET") {
      const authorization = req.headers.get("Authorization") || "";
      if (!authorization.toLowerCase().startsWith("bearer ")) return fail(401, "Войди в аккаунт заново.", "NO_SESSION");
      const data = await authRequest("user", "GET", undefined, authorization.slice(7).trim());
      return json({ user: publicUser(data) });
    }

    if (path === "/api/auth/logout" && req.method === "POST") {
      const authorization = req.headers.get("Authorization") || "";
      if (authorization.toLowerCase().startsWith("bearer ")) {
        await authRequest("logout", "POST", undefined, authorization.slice(7).trim());
      }
      return json({ message: "Ты вышел из аккаунта." });
    }

    return fail(404, "Маршрут не найден.", "NOT_FOUND");
  } catch (err) {
    console.error("[SkyRealm Auth]", path, (err as any)?.status || "", (err as any)?.message || err);
    if (path === "/api/auth/register" && Number((err as any)?.status) >= 500) {
      return fail(503, "Аккаунт не удалось зарегистрировать или отправить письмо. Проверь настройки почты Supabase и попробуй снова.", "EMAIL_SEND_FAILED", String(payload.email || "").toLowerCase());
    }
    return authError(err, String(payload.email || "").toLowerCase());
  }
});
