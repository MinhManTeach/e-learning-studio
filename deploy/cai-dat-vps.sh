#!/usr/bin/env bash
# Cài hoặc cập nhật lopso.vn trên một VPS Ubuntu mới, chạy một lệnh:
#   curl -fsSL https://raw.githubusercontent.com/MinhManTeach/e-learning-studio/main/deploy/cai-dat-vps.sh | sudo bash -s lopso.vn
# Chạy lại đúng lệnh đó để cập nhật lên bản mới nhất của cả 3 ứng dụng.
set -euo pipefail

DOMAIN="${1:-lopso.vn}"
BASE=/opt/giangvui
APPS_DIR="$BASE/hoc-sinh"
ENV_FILE=/etc/giangvui.env
GH=https://github.com/MinhManTeach

[ "$(id -u)" = 0 ] || { echo "Cần chạy bằng sudo."; exit 1; }

echo "== 1. Cài Node 22, Caddy, git (chỉ lần đầu)"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi
apt-get install -y git

# Máy 1 GB RAM dễ hết bộ nhớ khi build: thêm 2 GB bộ nhớ tạm (swap) nếu chưa có.
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

id giangvui >/dev/null 2>&1 || useradd --system --home "$BASE" --shell /usr/sbin/nologin giangvui
mkdir -p "$BASE" "$APPS_DIR" /var/lib/giangvui

fetch() { # fetch <repo> <thư mục>: tải lần đầu, các lần sau lấy bản mới nhất
  if [ -d "$2/.git" ]; then git -C "$2" fetch -q origin && git -C "$2" reset -q --hard origin/HEAD
  else git clone -q "$GH/$1.git" "$2"; fi
}

echo "== 2. Build máy chủ soạn bài (e-learning-studio)"
fetch e-learning-studio "$BASE/e-learning-studio"
(cd "$BASE/e-learning-studio" && npm ci --no-audit --no-fund && npm run build && npm run build:server)

echo "== 3. Build các ứng dụng học sinh"
for app in English-Adventure:english-adventure be-vui-hoc-cong:be-vui-hoc-cong; do
  repo="${app%%:*}"; name="${app##*:}"
  fetch "$repo" "$BASE/src-$name"
  (cd "$BASE/src-$name" && npm install --no-audit --no-fund && npx vite build --base="/hoc-sinh/$name/" --outDir "$APPS_DIR/$name/dist" --emptyOutDir)
done
chown -R giangvui:giangvui /var/lib/giangvui

echo "== 4. Tệp cấu hình $ENV_FILE"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<CONF
PUBLIC_URL=https://$DOMAIN
PORT=8080
DATA_DIR=/var/lib/giangvui
APPS_DIR=$APPS_DIR
FREE_CREDITS=3
# Điền các khoá dưới đây rồi chạy: sudo systemctl restart giangvui
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
LESSON_AI_API_KEY=
LESSON_AI_MODEL=claude-haiku-5-5
GOOGLE_TTS_API_KEY=
CONF
  chmod 600 "$ENV_FILE"
  echo "   Đã tạo $ENV_FILE. Nhớ điền khoá Google và PayOS."
fi

echo "== 5. Dịch vụ tự chạy và HTTPS"
cat > /etc/systemd/system/giangvui.service <<UNIT
[Unit]
Description=lopso.vn
After=network.target
[Service]
EnvironmentFile=$ENV_FILE
WorkingDirectory=$BASE/e-learning-studio
ExecStart=/usr/bin/node dist-server/main.js
User=giangvui
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  reverse_proxy localhost:8080
}
CADDY
systemctl daemon-reload
systemctl enable giangvui >/dev/null
systemctl restart giangvui
systemctl reload caddy || systemctl restart caddy

sleep 2
if curl -fsS -o /dev/null http://localhost:8080/; then echo "== Xong: https://$DOMAIN đang chạy."
else echo "== Máy chủ chưa lên. Xem lỗi: journalctl -u giangvui -n 50"; exit 1; fi
