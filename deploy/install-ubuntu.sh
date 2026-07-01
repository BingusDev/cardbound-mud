#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/cardbound-mud"
APP_USER="cardbound"
ENV_DIR="/etc/cardbound-mud"
ENV_FILE="$ENV_DIR/cardbound-mud.env"
SERVICE_FILE="/etc/systemd/system/cardbound-mud.service"
NGINX_SITE="/etc/nginx/sites-available/cardbound-mud"
NGINX_LINK="/etc/nginx/sites-enabled/cardbound-mud"

usage() {
  cat <<'EOF'
Usage:
  sudo DOMAIN=play.example.com ADMIN_CODE=your-code ADMIN_PANEL_USERNAME=admin ADMIN_PANEL_PASSWORD=your-password ./deploy/install-ubuntu.sh

Optional:
  ENABLE_HTTPS=1
  EMAIL=you@example.com

Run this from a freshly cloned Cardbound repo on an Ubuntu VPS.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run with sudo."
  usage
  exit 1
fi

if [[ -z "${DOMAIN:-}" ]]; then
  echo "DOMAIN is required, for example DOMAIN=play.example.com"
  usage
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$SOURCE_DIR/package.json" || ! -f "$SOURCE_DIR/deploy/cardbound-mud.service.example" ]]; then
  echo "This does not look like the Cardbound repo: $SOURCE_DIR"
  exit 1
fi

echo "Installing system packages..."
apt update
apt install -y curl git nginx build-essential ca-certificates ufw openssl

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 22 ]]; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi

if [[ -z "${ADMIN_CODE:-}" ]]; then
  ADMIN_CODE="$(openssl rand -hex 24)"
fi

if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  ADMIN_TOKEN="$(openssl rand -hex 32)"
fi

if [[ -z "${ADMIN_PANEL_USERNAME:-}" ]]; then
  ADMIN_PANEL_USERNAME="admin"
fi

if [[ -z "${ADMIN_PANEL_PASSWORD:-}" ]]; then
  ADMIN_PANEL_PASSWORD="$(openssl rand -hex 32)"
fi

echo "Preparing app user..."
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

if [[ "$SOURCE_DIR" != "$APP_DIR" ]]; then
  echo "Copying repo to $APP_DIR..."
  mkdir -p "$APP_DIR"
  tar --exclude='./node_modules' -C "$SOURCE_DIR" -cf - . | tar -C "$APP_DIR" -xf -
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "Installing app dependencies..."
cd "$APP_DIR"
runuser -u "$APP_USER" -- npm ci
runuser -u "$APP_USER" -- npm run verify
runuser -u "$APP_USER" -- npm prune --omit=dev

echo "Writing environment file..."
mkdir -p "$ENV_DIR"
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
ADMIN_CODE=$ADMIN_CODE
ADMIN_TOKEN=$ADMIN_TOKEN
ADMIN_PANEL_USERNAME=$ADMIN_PANEL_USERNAME
ADMIN_PANEL_PASSWORD=$ADMIN_PANEL_PASSWORD
EOF
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"

echo "Installing systemd service..."
cp "$APP_DIR/deploy/cardbound-mud.service.example" "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable --now cardbound-mud

echo "Configuring Nginx..."
cp "$APP_DIR/deploy/nginx-cardbound.conf.example" "$NGINX_SITE"
sed -i "s/server_name example.com;/server_name $DOMAIN;/" "$NGINX_SITE"
ln -sf "$NGINX_SITE" "$NGINX_LINK"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "Opening firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

if [[ "${ENABLE_HTTPS:-0}" == "1" ]]; then
  echo "Installing HTTPS certificate..."
  apt install -y certbot python3-certbot-nginx
  if [[ -n "${EMAIL:-}" ]]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"
  else
    certbot --nginx -d "$DOMAIN"
  fi
fi

echo
echo "Cardbound is installed."
echo "Open: http://$DOMAIN"
echo
echo "Admin code, used once when creating your admin character:"
echo "$ADMIN_CODE"
echo
echo "Admin builder username:"
echo "$ADMIN_PANEL_USERNAME"
echo
echo "Admin builder password:"
echo "$ADMIN_PANEL_PASSWORD"
echo
echo "Useful checks:"
echo "  systemctl status cardbound-mud"
echo "  journalctl -u cardbound-mud -f"
