#!/usr/bin/env bash
# Curador (#4): detecta near-duplicados y enriquece enlaces del grafo.
# Por defecto SOLO reporta; exporta CURATOR_APPLY=1 para que escriba enlaces.
# Cron sugerido (1/dia):  0 5 * * * /root/obsiAgent/scripts/sync-curator.sh
set -euo pipefail
APP_URL="${APP_URL:-http://127.0.0.1:3001}"
ENV_FILE="${ENV_FILE:-/root/obsiAgent/.env}"
LOG="${LOG_FILE:-/var/log/obsiagent-curator.log}"
APPLY="${CURATOR_APPLY:-0}"
TOKEN="$(grep -E '^BULK_IMPORT_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]')"
[ -z "$TOKEN" ] && { echo "[sync-curator] falta BULK_IMPORT_TOKEN" >&2; exit 1; }
Q="token=$TOKEN"; [ "$APPLY" = "1" ] && Q="$Q&apply=1"
echo "[$(date '+%F %T')] sync-curator (apply=$APPLY) ->" >> "$LOG"
curl -fsS -X POST "$APP_URL/api/curator/run?$Q" >> "$LOG" 2>&1
echo >> "$LOG"
