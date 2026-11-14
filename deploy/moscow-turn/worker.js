const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8"
};

function reply(data, status=200) {
  return new Response(JSON.stringify(data), {status, headers:cors});
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function makeTurnPassword(secret, username) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {name:"HMAC", hash:"SHA-1"},
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username));
  return toBase64(signature);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response("ok", {headers:cors});
    if (request.method !== "POST" || new URL(request.url).pathname !== "/ice") {
      return reply({error:"NOT_FOUND"},404);
    }

    const authorization = request.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/i.test(authorization)) return reply({error:"AUTH_REQUIRED"},401);

    if (!env.TURN_HOST || !env.TURN_SHARED_SECRET || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return reply({error:"MOSCOW_TURN_NOT_CONFIGURED"},503);
    }

    let verified;
    try {
      verified = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
        headers:{apikey:env.SUPABASE_ANON_KEY, Authorization:authorization},
        signal:AbortSignal.timeout(5000)
      });
    } catch (_) {
      return reply({error:"AUTH_UNAVAILABLE"},503);
    }
    if (!verified.ok) return reply({error:"INVALID_SESSION"},401);

    const user = await verified.json().catch(()=>null);
    if (!user?.id) return reply({error:"INVALID_SESSION"},401);

    const ttl = 3600;
    const expiresAt = Math.floor(Date.now()/1000) + ttl;
    const username = expiresAt + ":" + user.id;
    const credential = await makeTurnPassword(env.TURN_SHARED_SECRET, username);
    const host = String(env.TURN_HOST).trim();

    return reply({
      iceServers:[
        {
          urls:[
            "turn:" + host + ":3478?transport=udp",
            "turn:" + host + ":3478?transport=tcp"
          ],
          username,
          credential
        }
      ],
      expiresIn:ttl,
      region:"moscow"
    });
  }
};
