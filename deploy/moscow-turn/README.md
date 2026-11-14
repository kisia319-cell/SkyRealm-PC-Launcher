# PrimeLauncher Moscow TURN relay

This directory deploys the real WebRTC TURN relay in a Moscow IQpark VPS. It adds a relay path to the existing P2P match connection; it does not move account data or PostgreSQL.

## VPS order

Provider: [Hosting Russia — Moscow VPS](https://hosting-russia.ru/vps?location=moscow)

Choose:
- Location: Moscow / IQpark (Tier III)
- Plan: Standard — 250 RUB/month
- 1 vCPU, 1 GB RAM, 20 GB NVMe
- Dedicated IPv4, 10 TB monthly traffic
- OS: Ubuntu 24.04 LTS or Debian 12
- Billing: one month initially; do not prepay annually until the route is measured

The provider advertises approximately 3 ms response from Moscow to the IQpark site itself. That is not a guarantee of the game's ping from every ISP.

## SSH key

Add this public key to the VPS during creation. It grants access only to this server if you add it to this VPS's authorized SSH keys:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGUIfJh3k1co8eVQYpzkwFLnkY7XNbCc8YjbSpZi82/S prime-moscow-turn-deploy
```

Do not send a root password in chat.

## Install Coturn

After the VPS is ready, open its console or connect using SSH and run:

```bash
curl -fsSL https://raw.githubusercontent.com/kisia319-cell/SkyRealm-PC-Launcher/main/deploy/moscow-turn/install-coturn.sh -o /root/install-coturn.sh
sudo bash /root/install-coturn.sh
```

The installer:
- Installs and enables Coturn
- Configures UDP/TCP 3478 and UDP relay ports 49160-49200
- Generates a random 256-bit shared secret
- Stores credentials root-only in `/etc/prime-turn/credentials.env`
- Does not print the secret

Allow these ports in the provider firewall too:
- TCP + UDP 3478
- UDP 49160-49200
- TCP 22 for SSH administration

## Activate the credential broker

The Cloudflare Worker is already deployed:

`https://prime-moscow-turn-auth.skyrealm.workers.dev/ice`

After Coturn is running, open Cloudflare Dashboard → Workers & Pages → `prime-moscow-turn-auth` → Settings → Variables and Secrets.

Set:
- Plain text variable `TURN_HOST` = the server's public IPv4 (the installer prints it)
- Secret `TURN_SHARED_SECRET` = the `TURN_SHARED_SECRET` value from `/etc/prime-turn/credentials.env`

The other Worker bindings (`SUPABASE_URL` and `SUPABASE_ANON_KEY`) are already configured. The Worker validates Supabase access tokens and returns one-hour HMAC-SHA1 TURN credentials. Never place the shared secret in EXE/APK files, GitHub source, or client-side settings.

## Acceptance checks

1. `systemctl is-active coturn` returns `active`.
2. TCP/UDP 3478 and UDP 49160-49200 are reachable from the internet.
3. The Worker begins issuing ICE servers after the two variables are configured.
4. Connect PC and Android; selected ICE candidate pair should show `relay` with the Moscow public IP.
5. Compare 30-second samples of P2P RTT, relay RTT, jitter, and packet loss.
6. Keep direct LAN P2P preferred for devices on the same Wi-Fi; Moscow TURN is a relay fallback for remote clients.

A Moscow relay cannot guarantee 50-100 ms on every ISP. The gain depends on where both players are and how their ISPs route traffic. Do not force every match through Moscow without comparing the actual measurements.
