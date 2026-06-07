#!/usr/bin/env bash
# Enrutador (#6): clasifica las notas nuevas por cliente (tag cliente/<slug>).
# Cron sugerido (cada 3 h):  0 */3 * * * /root/obsiAgent/scripts/sync-router.sh
set -euo pipefail
APP_URL="${APP_URL:-http://127.0.0.1:3001}"
ENV_FILE="${ENV_FILE:-/root/obsiAgent/.env}"
LOG="${LOG_FILE:-/var/log/obsiagent-router.log}"
LIMIT="${LIMIT:-25}"
TOKEN="$(grep -E '^BULK_IMPORT_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]')"
[ -z "$TOKEN" ] && { echo "[sync-router] falta BULK_IMPORT_TOKEN" >&2; exit 1; }
echo "[$(date '+%F %T')] sync-router ->" >> "$LOG"
curl -fsS -X POST "$APP_URL/api/router/run?token=$TOKEN&apply=1&limit=$LIMIT" >> "$LOG" 2>&1
echo >> "$LOG"
