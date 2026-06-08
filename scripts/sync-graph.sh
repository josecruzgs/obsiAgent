#!/usr/bin/env bash
# Dispara la sincronización NATIVA (Microsoft Graph) de TODAS las conexiones
# conectadas: OneDrive empresarial/personal + SharePoint (la biblioteca
# configurada). Ingiere documentos nuevos y RE-INGIERE los modificados sobre la
# misma nota (detecta cambios por cTag/fecha del archivo). Idempotente.
#
# Pensado para CRON en el HOST del VPS. Lee BULK_IMPORT_TOKEN del .env de la app.
# Cron (cada 10 min):  */10 * * * * /root/obsiAgent/scripts/sync-graph.sh
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3001}"
ENV_FILE="${ENV_FILE:-/root/obsiAgent/.env}"
LOG="${LOG_FILE:-/var/log/obsiagent-graph.log}"

TOKEN="$(grep -E '^BULK_IMPORT_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]')"
if [ -z "$TOKEN" ]; then
  echo "[sync-graph] ERROR: BULK_IMPORT_TOKEN no está en $ENV_FILE" >&2
  exit 1
fi

echo "[$(date '+%F %T')] sync-graph ->" >> "$LOG"
curl -fsS -X POST "$APP_URL/api/onedrive/sync?token=$TOKEN" >> "$LOG" 2>&1
echo >> "$LOG"
