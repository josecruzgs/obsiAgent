#!/usr/bin/env bash
# Reconstruye las notas de ESTADO por cliente/proyecto (agente de status, #2).
# Lee BULK_IMPORT_TOKEN del .env de la app. Pensado para CRON en el host.
# Cron (cada 6 h):  0 */6 * * * /root/obsiAgent/scripts/sync-status.sh
#
# Por defecto descubre los clientes por heurística. Para fijarlos, exporta
# CLIENTS='["Tomalab","North Tech","Explora"]' antes de llamar al script.
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3001}"
ENV_FILE="${ENV_FILE:-/root/obsiAgent/.env}"
LOG="${LOG_FILE:-/var/log/obsiagent-status.log}"
CLIENTS="${CLIENTS:-}"

TOKEN="$(grep -E '^BULK_IMPORT_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]')"
if [ -z "$TOKEN" ]; then
  echo "[sync-status] ERROR: BULK_IMPORT_TOKEN no está en $ENV_FILE" >&2
  exit 1
fi

BODY='{}'
if [ -n "$CLIENTS" ]; then BODY="{\"clients\":$CLIENTS}"; fi

echo "[$(date '+%F %T')] sync-status ->" >> "$LOG"
curl -fsS -X POST "$APP_URL/api/status/rebuild?token=$TOKEN" \
  -H "Content-Type: application/json" -d "$BODY" >> "$LOG" 2>&1
echo >> "$LOG"
