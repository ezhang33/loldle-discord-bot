#!/usr/bin/env bash
# Pull the latest main and restart the bot. Usage: sudo bash /opt/loldle-discord-bot/deploy/update.sh
set -euo pipefail
APP_DIR=/opt/loldle-discord-bot
sudo -u loldle bash -c "cd '$APP_DIR' && git pull --ff-only && npm ci --omit=dev"
systemctl restart loldle
sleep 3
systemctl --no-pager status loldle | head -5
