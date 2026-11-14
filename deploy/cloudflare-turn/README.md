# PrimeLauncher — Cloudflare Realtime TURN

This is the managed TURN relay for PrimeLauncher. It is global anycast, not a dedicated Moscow VPS. Cloudflare routes each TURN client to a nearby edge location.

## Pricing

The first 1,000 GB/month of Realtime egress is free across TURN and SFU combined. After that, Cloudflare documents $0.05/GB. Keep the relay as ICE fallback rather than forcing every match through it.

## Cloudflare resources

A Worker named `prime-moscow-turn-auth` already exists in the connected Cloudflare account. Its public endpoint is:

`https://prime-moscow-turn-auth.skyrealm.workers.dev/ice`

Deploy `worker.js` as that Worker. Configure these bindings:
- Plain text `SUPABASE_URL` = `https://jaaguprbfrzrcwuusher.supabase.co`
- Plain text `SUPABASE_ANON_KEY` = the Supabase publishable key already used by the existing Worker
- Plain text `TURN_KEY_ID` = the UID of a Cloudflare Realtime TURN key
- Secret `TURN_KEY_API_TOKEN` = the secret returned when creating that TURN key

Create the TURN key in Cloudflare Dashboard → Realtime → TURN, or via the Calls API with the `Calls Write` permission. Keep the secret server-side only. Never commit it to GitHub or embed it in EXE/APK files.

The Worker validates the caller's Supabase access token and requests 1-hour ICE credentials from Cloudflare's official Realtime TURN API. It does not mint Coturn HMAC credentials.

## Client behavior

PC and Android both request credentials from the Worker when a match transport starts. If the Worker is not configured or Cloudflare cannot issue credentials, the game silently continues with STUN/direct P2P. ICE chooses a relay only when required by network conditions.

The game HUD labels the selected relay path `TURN · Cloudflare`. Direct LAN/P2P remains preferred when available.

## Validation

- POST /ice without a bearer token must return 401.
- An authenticated session should receive Cloudflare STUN and TURN ICE server entries with one-hour credentials.
- Check the selected ICE candidate pair on PC and Android. A Cloudflare TURN test must show candidate type `relay`.
- Compare 30-second ping, jitter and packet loss samples. TURN usually improves connectivity and packet-loss consistency; it does not guarantee lower raw RTT.
