#!/usr/bin/env bash
# Sincroniza una carpeta de OneDrive con el inbox de obsiAgent y dispara la
# importación masiva. Pensado para ejecutarse por CRON en el HOST del VPS
# (no dentro del contenedor). Requiere rclone configurado con un remoto OneDrive.
#
# Flujo:
#   1) COPY server-side de los archivos nuevos a ObsiAgent/procesados (respaldo
#      dentro de OneDrive; no se descarga, es copia interna del proveedor).
#   2) MOVE esos mismos archivos a /srv/obsiagent/inbox (baja y borra del root,
#      así no se reprocesan). La subcarpeta "procesados" se excluye siempre.
#   3) POST /api/bulk-import (extrae texto -> Claude -> .md -> indexa).
#
# Uso manual:   /root/obsiAgent/scripts/sync-onedrive.sh
# Cron (5 min): */5 * * * * /root/obsiAgent/scripts/sync-onedrive.sh
set -euo pipefail

# ─── Config (sobreescribible por variables de entorno) ──────────────────────
REMOTE="${ONEDRIVE_REMOTE:-onedrive:ObsiAgent}"   # remoto:carpeta dentro de OneDrive
PROCESSED="${REMOTE}/procesados"                  # respaldo de los ya procesados (en OneDrive)
INBOX="${INBOX_DIR:-/srv/obsiagent/inbox}"        # carpeta del host montada en el contenedor
APP_URL="${APP_URL:-http://127.0.0.1:3001}"       # la app publica aquí (solo loopback)
ENV_FILE="${ENV_FILE:-/root/obsiAgent/.env}"      # de aquí se lee BULK_IMPORT_TOKEN
LOG="${LOG_FILE:-/var/log/obsiagent-sync.log}"

# Solo tomamos formatos que el extractor sabe leer (.md/.txt/.docx/.pdf).
# Lo demás (xlsx, imágenes, etc.) se queda en OneDrive sin tocar.
INCLUDE='{*.md,*.markdown,*.txt,*.docx,*.pdf}'
# Nunca tocar la subcarpeta de respaldo (evita reprocesar lo ya guardado).
EXCLUDE_PROC='/procesados/**'

# ─── Token de bulk-import (leído del .env de la app, sin exportar todo) ──────
TOKEN="$(grep -E '^BULK_IMPORT_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]')"
if [ -z "$TOKEN" ]; then
  echo "[sync-onedrive] ERROR: BULK_IMPORT_TOKEN no está en $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$INBOX"

# ─── 1) Respaldo server-side en OneDrive: root -> procesados ─────────────────
# Copia interna del proveedor (no descarga). Si no hay archivos nuevos, no hace nada.
rclone copy "$REMOTE" "$PROCESSED" \
  --exclude "$EXCLUDE_PROC" --include "$INCLUDE" \
  --transfers 4 \
  --log-file "$LOG" --log-level INFO

# ─── 2) OneDrive root -> inbox (move = baja y borra del root) ────────────────
rclone move "$REMOTE" "$INBOX" \
  --exclude "$EXCLUDE_PROC" --include "$INCLUDE" \
  --transfers 4 \
  --log-file "$LOG" --log-level INFO

# ─── 3) Dispara el procesamiento en la app ──────────────────────────────────
curl -fsS -X POST "$APP_URL/api/bulk-import?token=$TOKEN" | tee -a "$LOG"
echo >> "$LOG"
