// SkyRealm co-op API. Separate from skyrealm-auth; never trust client-supplied identity.
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARED_SNAPSHOT_FIELDS = new Set(["clearedSnowTiles","snowShovelHits","worldEarlyMonsters","mineLevel","houseLevel","dungeonRoom","dungeonClearedRooms","dungeonChestOpened","dungeonEnemyHp","biomeBosses","caveBossDefeated","caveBossHp","caveChestOpened","treasureChests","mineTileX","mineTileY","mineRocks","tradeEntranceX","tradeEntranceY","furnaceCrafted","placedStructures","lootDrops","adventureQuestProgress","farmCrops","discovered","exploredCells","wolfBossActive","wolfBossHp","wolfBossX","wolfBossY","wolfBossKeyDropped","wolfCageOpen","wolfDogCaged","wolfBossDefeated","wolfCompanionUnlocked","wolfCompanionHp","wolfCompanionRevivals","wolfCompanionOffsetX","wolfCompanionOffsetY","dogBehavior","villageQuestStage","blacksmithQuestStage","explorerQuestStage","npcQuestState","villageReputation","lastVillageRaidDay"]);
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
async function parseBody(req: Request, maxLength = 12_000): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > maxLength) throw new ApiError(413, "BODY_TOO_LARGE", "Слишком большой запрос.");
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
function sanitizeSharedSnapshot(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_SNAPSHOT_PAYLOAD", "Некорректный снимок общего мира.");
  }
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(input)) {
    if (!SHARED_SNAPSHOT_FIELDS.has(key)) {
      throw new ApiError(400, "INVALID_SNAPSHOT_PAYLOAD", "В снимке есть личные или неизвестные данные.");
    }
    output[key] = entry;
  }
  if (new TextEncoder().encode(JSON.stringify(output)).byteLength > 65_536) {
    throw new ApiError(413, "INVALID_SNAPSHOT_PAYLOAD", "Снимок общего мира слишком большой.");
  }
  return output;
}
function roomId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ApiError(400, "INVALID_ROOM_ID", "Некорректный ID комнаты.");
  return value;
}
function actionId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ApiError(400, "INVALID_ACTION_ID", "Некорректный ID действия.");
  return value;
}
function sanitizeWorldAction(actionType: unknown, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400,"INVALID_WORLD_ACTION","Недопустимое действие общего мира.");
  }
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item);
  if (actionType === "mine_rock") {
    if (keys.length !== 2 || keys.some(key => !["rock_index","tool"].includes(key))) {
      throw new ApiError(400,"INVALID_WORLD_ACTION","Некорректный запрос добычи.");
    }
    const rockIndex = Number(item.rock_index);
    const tool = typeof item.tool === "string" ? item.tool : "";
    if (!Number.isSafeInteger(rockIndex) || rockIndex < 0 || rockIndex > 64 ||
        !["Кирка","Улучшенная кирка","Кирка мастера"].includes(tool)) {
      throw new ApiError(400,"INVALID_WORLD_ACTION","Некорректная кирка или залежь.");
    }
    return { rock_index: rockIndex, tool };
  }
  if (actionType === "chop_tree") {
    if (keys.length !== 3 || keys.some(key => !["x","y","tool"].includes(key)) || item.tool !== "Топор") {
      throw new ApiError(400,"INVALID_WORLD_ACTION","Некорректный запрос рубки дерева.");
    }
    const treeX = Number(item.x), treeY = Number(item.y);
    if (!Number.isFinite(treeX) || !Number.isFinite(treeY) || treeX < 0 || treeX > 12000 || treeY < 0 || treeY > 10000) {
      throw new ApiError(400,"INVALID_WORLD_ACTION","Проверь координаты дерева.");
    }
    const gx = Math.round((treeX - 16) / 32) * 32 + 16, gy = Math.round((treeY - 16) / 32) * 32 + 16;
    if (Math.abs(treeX - gx) > 1 || Math.abs(treeY - gy) > 1) {
      throw new ApiError(400,"INVALID_WORLD_ACTION","Дерево должно находиться на сетке мира.");
    }
    return { x: gx, y: gy, tool: "Топор" };
  }
  const x = Number(item.x), y = Number(item.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 12000 || y < 0 || y > 10000) {
    throw new ApiError(400,"INVALID_WORLD_ACTION","Проверь координаты действия.");
  }
  const gx = Math.round((x - 16) / 32) * 32 + 16, gy = Math.round((y - 16) / 32) * 32 + 16;
  if (Math.abs(x - gx) > 1 || Math.abs(y - gy) > 1) {
    throw new ApiError(400,"INVALID_WORLD_ACTION","Действие должно находиться на сетке мира.");
  }
  if (actionType === "place_structure") {
    if (keys.length !== 3 || keys.some(key => !["type","x","y"].includes(key))) {
      throw new ApiError(400,"INVALID_WORLD_ACTION","В действии постройки есть лишние или отсутствующие поля.");
    }
    const type = typeof item.type === "string" ? item.type : "";
    if (!["furnace","house","torch","coal","storage","farmplot"].includes(type)) {
      throw new ApiError(400,"INVALID_WORLD_ACTION","Неизвестный тип постройки.");
    }
    return { type, x: gx, y: gy };
  }
  if (actionType === "farm_plant") {
    if (keys.length !== 3 || keys.some(key => !["x","y","crop_id"].includes(key))) {
      throw new ApiError(400,"INVALID_WORLD_ACTION","Некорректный запрос посадки.");
    }
    const crop = typeof item.crop_id === "string" ? item.crop_id : "";
    if (!["wheat","carrot","potato","tomato","corn","pumpkin","strawberry"].includes(crop)) {
      throw new ApiError(400,"INVALID_WORLD_ACTION","Неизвестная культура.");
    }
    return { x: gx, y: gy, crop_id: crop };
  }
  if (["farm_water","farm_compost","farm_fertilize","farm_harvest"].includes(String(actionType))) {
    if (keys.length !== 2 || keys.some(key => !["x","y"].includes(key))) {
      throw new ApiError(400,"INVALID_WORLD_ACTION","Некорректное фермерское действие.");
    }
    return { x: gx, y: gy };
  }
  throw new ApiError(400,"INVALID_WORLD_ACTION","Недопустимое действие общего мира.");
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
    if (message.includes("SNAPSHOT_VERSION_CONFLICT")) throw new ApiError(409, "SNAPSHOT_VERSION_CONFLICT", "Снимок мира уже обновился. Повтори синхронизацию.");
    if (message.includes("INVALID_SNAPSHOT_PAYLOAD") || message.includes("INVALID_SNAPSHOT_REQUEST")) throw new ApiError(400, "INVALID_SNAPSHOT_PAYLOAD", "Снимок мира содержит недопустимые данные.");
    if (message.includes("SNAPSHOT_NOT_FOUND")) throw new ApiError(404, "SNAPSHOT_NOT_FOUND", "Снимок комнаты не найден.");
    if (message.includes("INVALID_INVITE_CODE") || message.includes("ROOM_NOT_JOINABLE")) throw new ApiError(404, "INVITE_UNAVAILABLE", "Код приглашения недействителен или комната закрыта.");
    if (message.includes("ROOM_FULL")) throw new ApiError(409, "ROOM_FULL", "В комнате уже 8 игроков.");
    if (message.includes("OWNER_ONLY")) throw new ApiError(403, "OWNER_ONLY", "Это действие доступно только владельцу комнаты.");
    if (message.includes("ALREADY_IN_ROOM")) throw new ApiError(409, "ALREADY_IN_ROOM", "Сначала выйди из текущей активной комнаты.");
    if (message.includes("ROOM_NOT_PAUSED")) throw new ApiError(409, "ROOM_NOT_PAUSED", "Комната сейчас не находится на паузе.");
    if (message.includes("ROOM_NOT_IN_LOBBY")) throw new ApiError(409, "ROOM_NOT_IN_LOBBY", "Комната уже запущена или находится на паузе.");
    if (message.includes("ROOM_NOT_RUNNING")) throw new ApiError(409, "ROOM_NOT_RUNNING", "Игровая сессия сейчас не запущена.");
    if (message.includes("INVALID_WORLD_OBJECT")) throw new ApiError(400, "INVALID_WORLD_OBJECT", "Некорректный объект общего мира.");
    if(message.includes("INVALID_WORLD_ACTION"))throw new ApiError(400,"INVALID_WORLD_ACTION","Недопустимое действие общего мира.");
    if(message.includes("WORLD_ACTION_RATE_LIMITED"))throw new ApiError(429,"WORLD_ACTION_RATE_LIMITED","Слишком много действий. Подожди минуту.");
    if(message.includes("WORLD_ACTION_QUEUE_FULL"))throw new ApiError(409,"WORLD_ACTION_QUEUE_FULL","Очередь комнаты заполнена. Повтори позже.");
    if(message.includes("WORLD_ACTION_NOT_FOUND"))throw new ApiError(404,"WORLD_ACTION_NOT_FOUND","Запрос на действие не найден.");
    if(message.includes("WORLD_ACTION_NOT_PENDING"))throw new ApiError(409,"WORLD_ACTION_NOT_PENDING","Действие уже обработано.");
    if(message.includes("WORLD_ACTION_RESULT_MISSING"))throw new ApiError(400,"WORLD_ACTION_RESULT_MISSING","В снимке нет подтверждённой постройки.");
    if(message.includes("NOT_A_GUEST_MEMBER"))throw new ApiError(403,"NOT_A_GUEST_MEMBER","Только участники-гости могут отправлять запросы на постройки.");
    if(message.includes("INVALID_WORLD_ACTION_COMMIT"))throw new ApiError(400,"INVALID_WORLD_ACTION_COMMIT","Некорректное подтверждение действия.");
    if(message.includes("INVALID_FARM_ACTION_COMMIT"))throw new ApiError(400,"INVALID_FARM_ACTION_COMMIT","Некорректное подтверждение фермерского действия.");
    if(message.includes("INVALID_FARM_ACTION_RESULT"))throw new ApiError(400,"INVALID_FARM_ACTION_RESULT","Некорректная награда фермерского действия.");
    if(message.includes("FARM_PLOT_RESULT_MISSING"))throw new ApiError(409,"FARM_PLOT_RESULT_MISSING","Грядка отсутствует в общей версии мира.");
    if(message.includes("WRONG_WORLD_ACTION_TYPE"))throw new ApiError(409,"WRONG_WORLD_ACTION_TYPE","Тип действия не соответствует запросу.");
    if(message.includes("INVALID_MINE_ACTION_COMMIT"))throw new ApiError(400,"INVALID_MINE_ACTION_COMMIT","Некорректное подтверждение добычи.");
    if(message.includes("INVALID_MINE_ACTION_RESULT"))throw new ApiError(400,"INVALID_MINE_ACTION_RESULT","Некорректная награда за добычу.");
    if(message.includes("MINE_ROCK_RESULT_MISSING"))throw new ApiError(409,"MINE_ROCK_RESULT_MISSING","Залежь отсутствует в общей версии шахты.");
    if(message.includes("INVALID_TREE_ACTION_COMMIT"))throw new ApiError(400,"INVALID_TREE_ACTION_COMMIT","Некорректное подтверждение рубки дерева.");
    if(message.includes("INVALID_TREE_ACTION_RESULT"))throw new ApiError(400,"INVALID_TREE_ACTION_RESULT","Некорректная награда за дерево.");
    if(message.includes("TREE_RESULT_MISSING"))throw new ApiError(409,"TREE_RESULT_MISSING","Дерево отсутствует в общей версии мира.");
    if (message.includes("INVALID_WORLD_CLOCK")) throw new ApiError(400, "INVALID_WORLD_CLOCK", "Некорректное время игрового мира.");
    if (message.includes("INVALID_WORLD_DIFFICULTY")) throw new ApiError(400, "INVALID_WORLD_DIFFICULTY", "Выбрана неизвестная сложность мира.");
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
    return reply({ status: "ok", service: "skyrealm-coop", version: "0.4.0" });
  }
  try {
    const user = await authenticate(req);
    const body = req.method === "POST" ? await parseBody(req, (route.startsWith('/api/coop/snapshot/') || route === '/api/coop/actions/commit') ? 80_000 : 12_000) : {};
    if (route === "/api/coop/create" && req.method === "POST") {
      const inviteCode = newInviteCode();
      const difficulty = typeof body.world_difficulty === "string" ? body.world_difficulty : "medium";
      if (!["easy","medium","hard","hell","impossible"].includes(difficulty)) {
        throw new ApiError(400,"INVALID_WORLD_DIFFICULTY","Выбери одну из доступных сложностей.");
      }
      const created = await rpc("create_co_op_room_with_settings", {
        p_owner_id: user.id, p_code_hash: await sha256(inviteCode), p_world_difficulty: difficulty,
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
    if (route === "/api/coop/actions/enqueue" && req.method === "POST") {
      const payload = sanitizeWorldAction(body.action_type, body.payload);
      const action = await rpc("enqueue_co_op_world_action", {
        p_user_id:user.id, p_room_id:roomId(body.room_id), p_action_id:actionId(body.action_id),
        p_action_type:body.action_type, p_payload:payload,
      });
      return reply({ action });
    }
    if (route === "/api/coop/actions/pending" && req.method === "POST") {
      const limit = body.limit === undefined ? 25 : Number(body.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new ApiError(400,"INVALID_ACTION_LIMIT","Некорректный размер очереди.");
      const actions = await rpc("get_pending_co_op_world_actions", {
        p_user_id:user.id, p_room_id:roomId(body.room_id), p_limit:limit,
      });
      return reply({ actions });
    }
    if (route === "/api/coop/actions/status" && req.method === "POST") {
      const action = await rpc("get_co_op_world_action_status", {
        p_user_id:user.id, p_room_id:roomId(body.room_id), p_action_id:actionId(body.action_id),
      });
      return reply({ action });
    }
    if (route === "/api/coop/actions/commit" && req.method === "POST") {
      const expectedVersion = Number(body.expected_version);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new ApiError(400,"INVALID_SNAPSHOT_REQUEST","Некорректная версия снимка.");
      const payload = sanitizeSharedSnapshot(body.payload);
      const result = await rpc("commit_co_op_world_action", {
        p_user_id:user.id, p_room_id:roomId(body.room_id), p_action_id:actionId(body.action_id),
        p_expected_version:expectedVersion, p_payload:payload,
      });
      return reply({ result });
    }
    if (route === "/api/coop/actions/commit-farm" && req.method === "POST") {
      const expectedVersion = Number(body.expected_version);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        throw new ApiError(400,"INVALID_SNAPSHOT_REQUEST","Некорректная версия снимка.");
      }
      const payload = sanitizeSharedSnapshot(body.payload);
      if (!body.result || typeof body.result !== "object" || Array.isArray(body.result)) {
        throw new ApiError(400,"INVALID_FARM_ACTION_RESULT","Некорректный результат фермерского действия.");
      }
      const resultInput = body.result as Record<string, unknown>;
      if (Object.keys(resultInput).some(key => !["reward_name","reward_amount","consumed_item"].includes(key)) ||
          (resultInput.reward_name !== undefined && typeof resultInput.reward_name !== "string") ||
          (resultInput.consumed_item !== undefined && typeof resultInput.consumed_item !== "string") ||
          (resultInput.reward_amount !== undefined && (typeof resultInput.reward_amount !== "number" ||
            !Number.isFinite(resultInput.reward_amount) || resultInput.reward_amount < 0 || resultInput.reward_amount > 1000))) {
        throw new ApiError(400,"INVALID_FARM_ACTION_RESULT","Некорректный результат фермерского действия.");
      }
      const result = await rpc("commit_co_op_farm_action", {
        p_user_id:user.id, p_room_id:roomId(body.room_id), p_action_id:actionId(body.action_id),
        p_expected_version:expectedVersion, p_payload:payload, p_result:resultInput,
      });
      return reply({ result });
    }
    if (route === "/api/coop/actions/commit-mine" && req.method === "POST") {
      const expectedVersion = Number(body.expected_version);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        throw new ApiError(400,"INVALID_SNAPSHOT_REQUEST","Некорректная версия снимка.");
      }
      const payload = sanitizeSharedSnapshot(body.payload);
      if (!body.result || typeof body.result !== "object" || Array.isArray(body.result)) {
        throw new ApiError(400,"INVALID_MINE_ACTION_RESULT","Некорректная награда за добычу.");
      }
      const resultInput = body.result as Record<string, unknown>;
      const rewardNames = ["Камень","Уголь","Железо","Медь","Олово","Серебро","Золото","Рубин","Сапфир","Обсидиан","Мифрил","Уран","Алмаз","Кристалл"];
      if (Object.keys(resultInput).some(key => !["reward_name","reward_amount","bonus_name","bonus_amount"].includes(key)) ||
          (resultInput.reward_name !== undefined && (typeof resultInput.reward_name !== "string" || !rewardNames.includes(resultInput.reward_name))) ||
          (resultInput.bonus_name !== undefined && (typeof resultInput.bonus_name !== "string" || resultInput.bonus_name !== "Камень")) ||
          (resultInput.reward_amount !== undefined && (typeof resultInput.reward_amount !== "number" || !Number.isSafeInteger(resultInput.reward_amount) || resultInput.reward_amount < 0 || resultInput.reward_amount > 1000)) ||
          (resultInput.bonus_amount !== undefined && (typeof resultInput.bonus_amount !== "number" || !Number.isSafeInteger(resultInput.bonus_amount) || resultInput.bonus_amount < 0 || resultInput.bonus_amount > 1000))) {
        throw new ApiError(400,"INVALID_MINE_ACTION_RESULT","Некорректная награда за добычу.");
      }
      const result = await rpc("commit_co_op_mine_action", {
        p_user_id:user.id, p_room_id:roomId(body.room_id), p_action_id:actionId(body.action_id),
        p_expected_version:expectedVersion, p_payload:payload, p_result:resultInput,
      });
      return reply({ result });
    }
    if (route === "/api/coop/actions/commit-tree" && req.method === "POST") {
      const expectedVersion = Number(body.expected_version);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        throw new ApiError(400,"INVALID_SNAPSHOT_REQUEST","Некорректная версия снимка.");
      }
      const payload = sanitizeSharedSnapshot(body.payload);
      if (!body.result || typeof body.result !== "object" || Array.isArray(body.result)) {
        throw new ApiError(400,"INVALID_TREE_ACTION_RESULT","Некорректная награда за дерево.");
      }
      const resultInput = body.result as Record<string, unknown>;
      const validAmounts = ["reward_amount","bonus_amount","extra_amount"].every(key =>
        resultInput[key] === undefined || (typeof resultInput[key] === "number" &&
          Number.isSafeInteger(resultInput[key]) && resultInput[key] >= 0 && resultInput[key] <= 1000));
      if (Object.keys(resultInput).some(key => !["reward_name","reward_amount","bonus_name","bonus_amount","extra_name","extra_amount"].includes(key)) ||
          (resultInput.reward_name !== undefined && resultInput.reward_name !== "Древесина") ||
          (resultInput.bonus_name !== undefined && resultInput.bonus_name !== "Листья") ||
          (resultInput.extra_name !== undefined && resultInput.extra_name !== "Палка") || !validAmounts) {
        throw new ApiError(400,"INVALID_TREE_ACTION_RESULT","Некорректная награда за дерево.");
      }
      const result = await rpc("commit_co_op_tree_action", {
        p_user_id:user.id, p_room_id:roomId(body.room_id), p_action_id:actionId(body.action_id),
        p_expected_version:expectedVersion, p_payload:payload, p_result:resultInput,
      });
      return reply({ result });
    }
    if (route === "/api/coop/actions/reject" && req.method === "POST") {
      const reason = typeof body.reason === "string" ? body.reason.slice(0,120) : "rejected";
      const result = await rpc("reject_co_op_world_action", {
        p_user_id:user.id, p_room_id:roomId(body.room_id), p_action_id:actionId(body.action_id), p_reason:reason,
      });
      return reply({ result });
    }
    if (route === "/api/coop/start" && req.method === "POST") {
      const result = await rpc("start_co_op_room", { p_user_id: user.id, p_room_id: roomId(body.room_id) });
      return reply({ room: result });
    }
    if (route === "/api/coop/clock" && req.method === "POST") {
      const minute = Number(body.minute_total), nights = Number(body.survived_nights);
      if (!Number.isFinite(minute) || !Number.isSafeInteger(nights) || typeof body.blood_moon_active !== "boolean")
        throw new ApiError(400,"INVALID_WORLD_CLOCK","Некорректное время игрового мира.");
      const clock = await rpc("set_co_op_world_clock", { p_user_id:user.id,p_room_id:roomId(body.room_id),
        p_minute_total:minute,p_survived_nights:nights,p_blood_moon_active:body.blood_moon_active });
      return reply({ clock });
    }
    if (route === "/api/coop/death" && req.method === "POST") {
      const death = await rpc("record_co_op_shared_death", { p_user_id:user.id,p_room_id:roomId(body.room_id) });
      return reply({ death });
    }
    if (route === "/api/coop/claim" && req.method === "POST") {
      const objectKind = typeof body.object_kind === "string" ? body.object_kind : "";
      const objectId = typeof body.object_id === "string" ? body.object_id.trim() : "";
      if (!["treasure_chest", "cave_chest", "dungeon_chest"].includes(objectKind) ||
          !/^[a-z0-9][a-z0-9-]{0,63}$/.test(objectId) ||
          (objectKind === "cave_chest" && objectId !== "cave") ||
          (objectKind === "dungeon_chest" && objectId !== "dungeon-5")) {
        throw new ApiError(400, "INVALID_WORLD_OBJECT", "Некорректный объект общего мира.");
      }
      const claim = await rpc("claim_co_op_world_object", {
        p_user_id: user.id,
        p_room_id: roomId(body.room_id),
        p_object_kind: objectKind,
        p_object_id: objectId,
      });
      return reply({ claim });
    }
    if (route === "/api/coop/snapshot/get" && req.method === "POST") {
      const snapshot = await rpc("get_co_op_world_snapshot", {
        p_user_id: user.id, p_room_id: roomId(body.room_id),
      });
      return reply({ snapshot });
    }
    if (route === "/api/coop/snapshot/save" && req.method === "POST") {
      const expectedVersion = Number(body.expected_version);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        throw new ApiError(400, "INVALID_SNAPSHOT_REQUEST", "Некорректная версия снимка.");
      }
      const payload = sanitizeSharedSnapshot(body.payload);
      const snapshot = await rpc("save_co_op_world_snapshot", {
        p_user_id: user.id, p_room_id: roomId(body.room_id),
        p_expected_version: expectedVersion, p_payload: payload,
      });
      return reply({ snapshot });
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
