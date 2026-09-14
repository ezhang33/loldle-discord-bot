#!/usr/bin/env bash
# One-time provisioning for a fresh Ubuntu 24.04 host. Idempotent; safe to re-run.
# Usage: sudo bash deploy/setup.sh
set -euo pipefail

REPO_URL="https://github.com/ezhang33/loldle-discord-bot.git"
APP_DIR=/opt/loldle-discord-bot
DATA_DIR=/var/lib/loldle
ENV_FILE=/etc/loldle.env

if [[ $EUID -ne 0 ]]; then echo "run as root (sudo)"; exit 1; fi

# Node.js 22 LTS from NodeSource (Ubuntu's packaged Node is too old for node:sqlite).
if ! command -v node >/dev/null || [[ "$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')" -lt 22 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
apt-get install -y git unattended-upgrades

# Service account, code, data dir.
id -u loldle >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin loldle
install -d -o loldle -g loldle -m 750 "$DATA_DIR" "$DATA_DIR/backups"

if [[ ! -d "$APP_DIR/.git" ]]; then
    git clone "$REPO_URL" "$APP_DIR"
fi
chown -R loldle:loldle "$APP_DIR"
sudo -u loldle bash -c "cd '$APP_DIR' && git pull --ff-only && npm ci --omit=dev"

# Environment file: create a template if missing; never overwrite an existing one.
if [[ ! -f "$ENV_FILE" ]]; then
    cat > "$ENV_FILE" <<EOF
DISCORD_TOKEN=
CLIENT_ID=
OWNER_ID=
TIMEZONE=America/Los_Angeles
DB_PATH=$DATA_DIR/loldle.sqlite
DAILY_SEED=$(head -c 24 /dev/urandom | base64)
EOF
    echo ">> Fill in $ENV_FILE before starting the service."
fi
chmod 600 "$ENV_FILE"

# systemd unit, journald cap, nightly DB backup (keeps 14 days).
install -m 644 "$APP_DIR/deploy/loldle.service" /etc/systemd/system/loldle.service
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\n' > /etc/systemd/journald.conf.d/loldle.conf
systemctl restart systemd-journald
cat > /etc/cron.daily/loldle-backup <<'EOF'
#!/bin/sh
set -e
DATA=/var/lib/loldle
[ -f "$DATA/loldle.sqlite" ] || exit 0
sqlite3 "$DATA/loldle.sqlite" ".backup '$DATA/backups/loldle-$(date +%F).sqlite'" 2>/dev/null \
    || cp "$DATA/loldle.sqlite" "$DATA/backups/loldle-$(date +%F).sqlite"
find "$DATA/backups" -name 'loldle-*.sqlite' -mtime +14 -delete
EOF
chmod 755 /etc/cron.daily/loldle-backup
apt-get install -y sqlite3

systemctl daemon-reload
systemctl enable loldle
echo ">> Done. Start with: sudo systemctl start loldle && journalctl -u loldle -f"
