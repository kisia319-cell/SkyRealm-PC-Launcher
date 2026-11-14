# PrimeLauncher Moscow TURN relay

This directory deploys a real WebRTC TURN relay in the Moscow IQpark VPS. It is an add-on to the existing Supabase matchmaking/auth service; it does not move account data or PostgreSQL.

## Target VPS

Hosting Russia, Moscow / IQpark:
- Standard: 250 RUB/month
- 1 vCPU, 1 GB RAM, 20 GB NVMe
- Dedicated IPv4, 10 TB traffic
- KVM, basic DDoS protection

Order the one-month period first. Do not prepay annually until the route has been measured from both clients.

## Ports

Allow these ports in both the provider firewall and the OS firewall:
- TCP + UDP 3478 (TURN listener)
- UDP 49160-49200 (TURN relay allocations)
- TCP 22 only for SSH administration

## Install

Use a fresh Ubuntu 24.04 or Debian 12 server. Copy `install-coturn.sh` to the VPS and run as root:

```bash
sudo PUBLIC_IPV4=<VPS_PUBLIC_IPV4> bash install-coturn.sh
```

The script creates a random 256-bit shared secret and stores it root-only in:
`/root/prime-turn-credentials.env`

It does not print the secret. It installs coturn, configures the relay range, opens the required UFW ports if UFW is active, and enables the systemd service.

## Credential broker

Deploy `worker.js` as the Cloudflare Worker `prime-moscow-turn-auth` on the SkyRealm account's workers.dev subdomain. Configure:
- Plain text binding `SUPABASE_URL` = `https://jaaguprbfrzrcwuusher.supabase.co`
- Plain text binding `SUPABASE_ANON_KEY` = the project's publishable key
- Plain text binding `TURN_HOST` = the VPS public IPv4
- Secret binding `TURN_SHARED_SECRET` = the value in `/root/prime-turn-credentials.env`

The Worker validates every Supabase access token with Supabase Auth and returns HMAC-SHA1 time-limited TURN credentials. Do not put the shared secret into the EXE, APK, GitHub source, or client-side settings.

Worker endpoint:
`https://prime-moscow-turn-auth.skyrealm.workers.dev/ice`

## Acceptance checks

1. Confirm `systemctl is-active coturn`.
2. Confirm UDP/TCP 3478 and UDP 49160-49200 are reachable.
3. Confirm the credential broker returns ICE servers for an authenticated user.
4. Connect PC and Android; inspect selected ICE candidate pair. It must show `relay` and the Moscow public IP for the Moscow relay test.
5. Compare 30-second samples: P2P RTT, TURN RTT, jitter, packet loss. Keep direct LAN P2P as the preferred path on the same Wi-Fi; the Moscow relay is a fallback for remote clients.
6. Roll back by switching the region preference back to Auto and disabling the TURN credentials.

## Important

A Moscow relay does not guarantee 50-100 ms for every route. The actual benefit depends on where both players are, their ISP routing, and whether direct P2P is blocked or unstable. Measure before changing the default route.
