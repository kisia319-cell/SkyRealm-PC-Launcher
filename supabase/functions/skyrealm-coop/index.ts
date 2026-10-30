// SkyRealm co-op API. Separate from skyrealm-auth; never trust client-supplied identity.
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code;
  }
}
function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > 12_000) throw new ApiError(413, "BODY_TOO_LARGE", "Слишком большой запрос.");
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Некорректный запрос.");
  }
}
function bearer(req: Request): string {
  const value = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(value)) throw new ApiError(401, "NO_SESSION", "Войди в аккаунт SkyRealm.");
  return value.replace(/^Bearer\s+/i, "").trim();
}
async function authenticate(req: Request) {
  const token = bearer(req);
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: ANON_KEY, Authorization: "Bearer " + token },
  });
  if (!response.ok) throw new ApiError(401, "INVALID_SESSION", "Сессия устарела. Войди снова.");
  const user = await response.json();
  if (!user?.id || !UUID_PATTERN.test(user.id)) throw new ApiError(401, "INVALID_SESSION", "Не удалось подтвердить аккаунт.");
  return { id: user.id as string, accessToken: token };
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
function newInviteCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => CODE_ALPHABET[b & 31]).join("");
}
function normalizeCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/[-\s]/g, "");
}
function roomId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ApiError(400, "INVALID_ROOM_ID", "Некорректный ID комнаты.");
  return value;
}
async function rpc(name: string, args: Record<string, unknown>) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { message: raw }; }
  if (!response.ok) {
    const message = String(payload.message ?? payload.details ?? "");
    if (message.includes("JOIN_RATE_LIMITED")) throw new ApiError(429, "JOIN_RATE_LIMITED", "Слишком много попыток. Подожди 15 минут.");
    if (message.includes("INVALID_INVITE_CODE") || message.includes("ROOM_NOT_JOINABLE")) throw new ApiError(404, "INVITE_UNAVAILABLE", "Код приглашения недействителен или комната закрыта.");
    if (message.includes("ROOM_FULL")) throw new ApiError(409, "ROOM_FULL", "В комнате уже 8 игроков.");
    if (message.includes("OWNER_ONLY")) throw new ApiError(403, "OWNER_ONLY", "Это действие доступно только владельцу комнаты.");
    if (message.includes("ALREADY_IN_ROOM")) throw new ApiError(409, "ALREADY_IN_ROOM", "Сначала выйди из текущей активной комнаты.");
    if (message.includes("ROOM_NOT_PAUSED")) throw new ApiError(409, "ROOM_NOT_PAUSED", "Комната сейчас не находится на паузе.");
    if (message.includes("NOT_A_MEMBER")) throw new ApiError(403, "NOT_A_MEMBER", "Ты больше не состоишь в этой комнате.");
    if (message.includes("ROOM_NOT_FOUND")) throw new ApiError(404, "ROOM_NOT_FOUND", "Комната не найдена.");
    console.error("[SkyRealm Co-op RPC]", name, response.status, payload);
    throw new ApiError(503, "COOP_BACKEND_ERROR", "Сервис кооператива временно недоступен.");
  }
  return payload;
}
function routeFor(req: Request): string {
  const url = new URL(req.url);
  const marker = "/functions/v1/skyrealm-coop";
  let path = url.searchParams.get("route") || (url.pathname.startsWith(marker) ? url.pathname.slice(marker.length) : url.pathname) || "/";
  if (!path.startsWith("/")) path = "/" + path;
  if (path === "/" && req.method === "GET") return "/health";
  return path;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    return reply({ error: { code: "SERVER_CONFIG", message: "Co-op API is not configured." } }, 500);
  }
  const route = routeFor(req);
  if (route === "/health" && req.method === "GET") {
    return reply({ status: "ok", service: "skyrealm-coop", version: "0.1.0" });
  }
  try {
    const user = await authenticate(req);
    const body = req.method === "POST" ? await parseBody(req) : {};
    if (route === "/api/coop/create" && req.method === "POST") {
      const inviteCode = newInviteCode();
      const created = await rpc("create_co_op_room", {
        p_owner_id: user.id,
        p_code_hash: await sha256(inviteCode),
      });
      return reply({ room: created, invite_code: inviteCode });
    }
    if (route === "/api/coop/join" && req.method === "POST") {
      const code = normalizeCode(body.invite_code);
      if (!CODE_PATTERN.test(code)) throw new ApiError(400, "INVALID_INVITE_CODE", "Введи 8 символов кода приглашения.");
      const room = await rpc("join_co_op_room", {
        p_user_id: user.id,
        p_code_hash: await sha256(code),
      });
      return reply({ room });
    }
    if (route === "/api/coop/current" && req.method === "GET") {
      const room = await rpc("get_my_co_op_room", { p_user_id: user.id });
      return reply({ room, user_id: user.id });
    }
    if (route === "/api/coop/leave" && req.method === "POST") {
      const result = await rpc("leave_co_op_room", { p_user_id: user.id, p_room_id: roomId(body.room_id) });
      return reply({ room: result });
    }
    if (route === "/api/coop/resume" && req.method === "POST") {
      const result = await rpc("resume_co_op_room", { p_user_id: user.id, p_room_id: roomId(body.room_id) });
      return reply({ room: result });
    }
    if (route === "/api/coop/pvp" && req.method === "POST") {
      if (typeof body.enabled !== "boolean") throw new ApiError(400, "INVALID_PVP_VALUE", "Укажи enabled: true или false.");
      const result = await rpc("set_co_op_pvp", {
        p_user_id: user.id, p_room_id: roomId(body.room_id), p_enabled: body.enabled,
      });
      return reply({ room: result });
    }
    if (route === "/api/coop/heartbeat" && req.method === "POST") {
      const result = await rpc("touch_co_op_heartbeat", { p_user_id: user.id, p_room_id: roomId(body.room_id) });
      return reply({ heartbeat: result });
    }
    if (route === "/api/coop/recover-owner" && req.method === "POST") {
      const result = await rpc("recover_stale_co_op_owner", { p_user_id: user.id, p_room_id: roomId(body.room_id) });
      return reply({ room: result });
    }
    return reply({ error: { code: "NOT_FOUND", message: "Маршрут не найден." } }, 404);
  } catch (err) {
    if (err instanceof ApiError) return reply({ error: { code: err.code, message: err.message } }, err.status);
    console.error("[SkyRealm Co-op]", route, err);
    return reply({ error: { code: "INTERNAL_ERROR", message: "Не удалось выполнить запрос кооператива." } }, 500);
  }
});
