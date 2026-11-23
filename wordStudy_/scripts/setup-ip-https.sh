#!/usr/bin/env bash
# 라즈베리파이의 기존 앱 앞에 공인 IP HTTPS 프록시를 설치합니다.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'sudo로 실행해 주세요.' >&2; exit 1; }
public_ip=${1:?사용법: sudo bash setup-ip-https.sh 공인IPv4 [앱사용자]}
app_user=${2:-${SUDO_USER:-}}
[[ -n "$app_user" && "$app_user" != root ]] || { echo '앱 실행 계정을 지정하세요.' >&2; exit 1; }
python3 - "$public_ip" <<'PY'
import ipaddress, sys
ip = ipaddress.ip_address(sys.argv[1])
if ip.version != 4 or not ip.is_global:
    raise SystemExit('유효한 공인 IPv4 주소가 필요합니다.')
PY
app_home=$(getent passwd "$app_user" | cut -d: -f6)
app_dir="$app_home/apps/wordstudy/wordStudy_"
[[ -f "$app_dir/.env" ]] || { echo '배포된 앱의 .env를 찾지 못했습니다.' >&2; exit 1; }
actual_ip=$(curl -4 -fsS --connect-timeout 5 --max-time 15 https://api.ipify.org)
[[ "$actual_ip" == "$public_ip" ]] || { echo '현재 공인 IP가 입력값과 다릅니다.' >&2; exit 1; }
backup="/root/wordstudy-https-backup-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$backup"
cp -a "$app_dir/.env" "$backup/app.env"
[[ ! -d /etc/nginx ]] || cp -a /etc/nginx "$backup/"
export DEBIAN_FRONTEND=noninteractive
apt-get -o DPkg::Lock::Timeout=600 update
apt-get -o DPkg::Lock::Timeout=600 install -y nginx snapd
if [[ ! -x /snap/bin/certbot ]]; then snap install certbot --classic; fi
/snap/bin/certbot --version | python3 -c 'import re,sys; v=re.search(r"(\d+)\.(\d+)",sys.stdin.read()); assert v and tuple(map(int,v.groups())) >= (5,4), "Certbot 5.4 이상이 필요합니다. sudo snap refresh certbot 후 재시도하세요."'
install -d -m 755 /var/www/wordstudy-acme/.well-known/acme-challenge
site=/etc/nginx/sites-available/wordstudy-ip.conf
# 인증서 발급 전에도 기존 HTTP 앱 접속은 계속 제공합니다.
cat > "$site" <<EOF
server {
    listen 80;
    server_name $public_ip;
    client_max_body_size 5m;
    location /.well-known/acme-challenge/ {
        root /var/www/wordstudy-acme;
        try_files \$uri =404;
    }
    location / {
        proxy_pass http://127.0.0.1:43871;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sfn "$site" /etc/nginx/sites-enabled/wordstudy-ip.conf
nginx -t
systemctl enable --now nginx
systemctl reload nginx
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
    ufw allow 80/tcp comment 'WordStudy ACME HTTP'
    ufw allow 443/tcp comment 'WordStudy HTTPS'
fi
# 공유기의 외부 80 -> 내부 80이 적용되어야 이 검증이 성공합니다.
cert_args=(certonly --non-interactive --agree-tos --register-unsafely-without-email
    --preferred-profile shortlived --webroot --webroot-path /var/www/wordstudy-acme
    --ip-address "$public_ip" --cert-name wordstudy-ip)
if ! /snap/bin/certbot "${cert_args[@]}" --dry-run; then
    echo '인증 사전 검증 실패. 공유기 외부 TCP 80 -> 라즈베리파이 TCP 80 설정을 확인한 뒤 재실행하세요.' >&2
    exit 1
fi
/snap/bin/certbot "${cert_args[@]}"
cat > "$site" <<EOF
server {
    listen 80;
    server_name $public_ip;
    location /.well-known/acme-challenge/ {
        root /var/www/wordstudy-acme;
        try_files \$uri =404;
    }
    location / { return 301 https://$public_ip\$request_uri; }
}
server {
    listen 443 ssl;
    server_name $public_ip;
    ssl_certificate /etc/letsencrypt/live/wordstudy-ip/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wordstudy-ip/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 5m;
    location / {
        proxy_pass http://127.0.0.1:43871;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
nginx -t
systemctl reload nginx
install -d /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/wordstudy-nginx <<'HOOK'
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/bin/systemctl reload nginx
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/wordstudy-nginx
cat > /etc/systemd/system/wordstudy-certbot-renew.service <<'UNIT'
[Unit]
Description=WordStudy IP 인증서 갱신
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
ExecStart=/snap/bin/certbot renew --quiet --cert-name wordstudy-ip
UNIT
cat > /etc/systemd/system/wordstudy-certbot-renew.timer <<'UNIT'
[Unit]
Description=WordStudy IP 인증서 6시간 간격 갱신 확인
[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
RandomizedDelaySec=900
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now wordstudy-certbot-renew.timer
# 기존 DB 암호·관리자 설정·세션 비밀값은 보존합니다.
python3 - "$app_dir/.env" "$public_ip" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
lines = [line for line in p.read_text().splitlines() if not line.startswith('PUBLIC_ORIGIN=')]
lines.append('PUBLIC_ORIGIN=https://' + sys.argv[2])
p.write_text('\n'.join(lines) + '\n')
p.chmod(0o600)
PY
app_uid=$(id -u "$app_user")
runuser -u "$app_user" -- env XDG_RUNTIME_DIR="/run/user/$app_uid" \
    bash -c 'cd "$1"; sh ./start.sh' bash "$app_dir"
curl -fsS --retry 10 --retry-connrefused --retry-delay 2 --max-time 15 \
    --resolve "$public_ip:443:127.0.0.1" "https://$public_ip/api/health"
/snap/bin/certbot certificates --cert-name wordstudy-ip
systemctl is-active wordstudy-certbot-renew.timer
printf '\nHTTPS 설정 완료: https://%s\n백업: %s\n' "$public_ip" "$backup"
