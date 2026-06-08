#!/usr/bin/env bash
# Sincroniza los ARCHIVOS de OneDrive (conexión nativa por Graph) hacia el vault,
# igual que el botón "Sincronizar" de /config, para TODAS las conexiones.
# Cron sugerido (cada 10 min):  */10 * * * * /root/obsiAgent/scripts/sync-files.sh
set -euo pipefail
APP_URL="${APP_URL:-http://127.0.0.1:3001}"
ENV_FILE="${ENV_FILE:-/root/obsiAgent/.env}"
LOG="${LOG_FILE:-/var/log/obsiagent-files.log}"
TOKEN="$(grep -E '^BULK_IMPORT_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]')"
[ -z "$TOKEN" ] && { echo "[sync-files] falta BULK_IMPORT_TOKEN en $ENV_FILE" >&2; exit 1; }
echo "[$(date '+%F %T')] sync-files ->" >> "$LOG"
curl -fsS -X POST "$APP_URL/api/onedrive/sync?token=$TOKEN" >> "$LOG" 2>&1
echo >> "$LOG"
