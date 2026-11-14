#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo PUBLIC_IPV4=<ip> bash install-coturn.sh" >&2
  exit 1
fi

PUBLIC_IP="${PUBLIC_IPV4:-}"
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$(curl -4fsS --max-time 5 https://api.ipify.org || true)"
fi
if [[ ! "$PUBLIC_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "Could not determine public IPv4. Set PUBLIC_IPV4 explicitly." >&2
  exit 1
fi

LOCAL_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1);exit}}')"
if [[ -z "$LOCAL_IP" ]]; then
  echo "Could not determine local interface IPv4." >&2
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y coturn ufw curl openssl ca-certificates

TURN_SECRET="$(openssl rand -hex 32)"
install -d -m 0700 /etc/prime-turn /var/log/turnserver

if [[ "$LOCAL_IP" == "$PUBLIC_IP" ]]; then
  EXTERNAL_LINE="external-ip=$PUBLIC_IP"
else
  EXTERNAL_LINE="external-ip=$PUBLIC_IP/$LOCAL_IP"
fi

cat >/etc/turnserver.conf <<EOF
listening-port=3478
listening-ip=$LOCAL_IP
relay-ip=$LOCAL_IP
$EXTERNAL_LINE
min-port=49160
max-port=49200
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=prime-moscow
server-name=prime-moscow
no-tls
no-dtls
no-cli
no-loopback-peers
no-multicast-peers
stale-nonce=600
user-quota=16
total-quota=128
proc-user=turnserver
proc-group=turnserver
log-file=/var/log/turnserver/turn.log
simple-log
EOF

cat >/etc/default/coturn <<'EOF'
TURNSERVER_ENABLED=1
EOF

chmod 0640 /etc/turnserver.conf
chown root:turnserver /etc/turnserver.conf
cat >/etc/prime-turn/credentials.env <<EOF
TURN_HOST=$PUBLIC_IP
TURN_SHARED_SECRET=$TURN_SECRET
EOF
chmod 0600 /etc/prime-turn/credentials.env

if command -v ufw >/dev/null 2>&1; then
  if ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 3478/tcp
    ufw allow 3478/udp
    ufw allow 49160:49200/udp
  fi
fi

systemctl enable coturn
systemctl restart coturn
sleep 2
systemctl is-active --quiet coturn

echo "Moscow TURN relay is installed."
echo "TURN_HOST=$PUBLIC_IP"
echo "TURN_SHARED_SECRET is stored root-only in /etc/prime-turn/credentials.env"
echo "Open provider firewall: TCP+UDP 3478, UDP 49160-49200."
echo "Do not copy the shared secret into client apps or source control."
