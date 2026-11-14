const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8"
};

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

async function hashIdentifier(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/ice") {
      return reply({ error: "NOT_FOUND" }, 404);
    }

    const authorization = request.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/i.test(authorization)) return reply({ error: "AUTH_REQUIRED" }, 401);
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return reply({ error: "TURN_NOT_CONFIGURED" }, 503);

    let authResponse;
    try {
      authResponse = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization },
        signal: AbortSignal.timeout(5000)
      });
    } catch (_) {
      return reply({ error: "AUTH_UNAVAILABLE" }, 503);
    }
    if (!authResponse.ok) return reply({ error: "INVALID_SESSION" }, 401);

    const user = await authResponse.json().catch(() => null);
    if (!user?.id) return reply({ error: "INVALID_SESSION" }, 401);

    let turnResponse;
    try {
      turnResponse = await fetch(
        "https://rtc.live.cloudflare.com/v1/turn/keys/" +
          encodeURIComponent(env.TURN_KEY_ID) +
          "/credentials/generate-ice-servers",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + env.TURN_KEY_API_TOKEN,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ttl: 3600,
            customIdentifier: "prime-" + await hashIdentifier(user.id)
          }),
          signal: AbortSignal.timeout(8000)
        }
      );
    } catch (_) {
      return reply({ error: "TURN_PROVIDER_UNAVAILABLE" }, 503);
    }

    const data = await turnResponse.json().catch(() => null);
    if (!turnResponse.ok || !Array.isArray(data?.iceServers)) {
      return reply({ error: "TURN_CREDENTIALS_FAILED", providerStatus: turnResponse.status }, 503);
    }

    const iceServers = data.iceServers.map(server => ({
      ...server,
      urls: Array.isArray(server.urls)
        ? server.urls.filter(url => !String(url).includes(":53?"))
        : server.urls
    }));

    return reply({ iceServers, expiresIn: 3600, provider: "cloudflare-realtime" });
  }
};
