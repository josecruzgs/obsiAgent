#!/usr/bin/env bash
# Dispara la sincronización de transcripciones de Teams de TODAS las conexiones
# elegibles (lee el transcript embebido en las grabaciones de OneDrive, lo resume
# con IA y lo ingiere). Idempotente y con corte "solo nuevas" en la app.
#
# Pensado para CRON en el HOST del VPS. Lee BULK_IMPORT_TOKEN del .env de la app.
# Cron (cada 15 min):  */15 * * * * /root/obsiAgent/scripts/sync-teams.sh
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3001}"
ENV_FILE="${ENV_FILE:-/root/obsiAgent/.env}"
LOG="${LOG_FILE:-/var/log/obsiagent-teams.log}"

TOKEN="$(grep -E '^BULK_IMPORT_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]')"
if [ -z "$TOKEN" ]; then
  echo "[sync-teams] ERROR: BULK_IMPORT_TOKEN no está en $ENV_FILE" >&2
  exit 1
fi

echo "[$(date '+%F %T')] sync-teams ->" >> "$LOG"
curl -fsS -X POST "$APP_URL/api/teams/sync?token=$TOKEN" >> "$LOG" 2>&1
echo >> "$LOG"
