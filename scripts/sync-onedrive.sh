#!/usr/bin/env bash
# Sincroniza una carpeta de OneDrive con el inbox de obsiAgent y dispara la
# importación masiva. Pensado para ejecutarse por CRON en el HOST del VPS
# (no dentro del contenedor). Requiere rclone configurado con un remoto OneDrive.
#
# Flujo:
#   1) MOVE los archivos nuevos del root de ObsiAgent -> /srv/obsiagent/inbox
#      (baja y borra del root; se excluyen las subcarpetas procesados/fallidos).
#   2) POST /api/bulk-import -> extrae texto, Claude digiere, escribe .md, indexa.
#      bulk-import separa cada original en inbox/_procesados o inbox/_fallidos.
#   3) Sube de vuelta a OneDrive según el resultado real:
#        inbox/_procesados -> ObsiAgent/procesados
#        inbox/_fallidos   -> ObsiAgent/fallidos
#
# Uso manual:   /root/obsiAgent/scripts/sync-onedrive.sh
# Cron (5 min): */5 * * * * /root/obsiAgent/scripts/sync-onedrive.sh
set -euo pipefail

# ─── Config (sobreescribible por variables de entorno) ──────────────────────
REMOTE="${ONEDRIVE_REMOTE:-onedrive:ObsiAgent}"   # remoto:carpeta dentro de OneDrive
PROCESSED="${REMOTE}/procesados"                  # respaldo de los procesados OK (en OneDrive)
FAILED="${REMOTE}/fallidos"                       # respaldo de los que fallaron (en OneDrive)
INBOX="${INBOX_DIR:-/srv/obsiagent/inbox}"        # carpeta del host montada en el contenedor
APP_URL="${APP_URL:-http://127.0.0.1:3001}"       # la app publica aquí (solo loopback)
ENV_FILE="${ENV_FILE:-/root/obsiAgent/.env}"      # de aquí se lee BULK_IMPORT_TOKEN
LOG="${LOG_FILE:-/var/log/obsiagent-sync.log}"

# Solo tomamos formatos que el extractor sabe leer (.md/.txt/.docx/.pdf).
# Lo demás (xlsx, imágenes, etc.) se queda en OneDrive sin tocar.
INCLUDE='{*.md,*.markdown,*.txt,*.docx,*.pdf,*.vtt}'
# Nunca re-bajar las subcarpetas de respaldo (evita reprocesar lo ya guardado).
EXCLUDE_PROC='/procesados/**'
EXCLUDE_FAIL='/fallidos/**'

# ─── Token de bulk-import (leído del .env de la app, sin exportar todo) ──────
TOKEN="$(grep -E '^BULK_IMPORT_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]')"
if [ -z "$TOKEN" ]; then
  echo "[sync-onedrive] ERROR: BULK_IMPORT_TOKEN no está en $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$INBOX"

# ─── 1) OneDrive root -> inbox (move = baja y borra del root) ────────────────
rclone move "$REMOTE" "$INBOX" \
  --exclude "$EXCLUDE_PROC" --exclude "$EXCLUDE_FAIL" --include "$INCLUDE" \
  --transfers 4 \
  --log-file "$LOG" --log-level INFO

# ─── 2) Dispara el procesamiento en la app ──────────────────────────────────
# bulk-import mueve cada original a inbox/_procesados o inbox/_fallidos.
curl -fsS -X POST "$APP_URL/api/bulk-import?token=$TOKEN" | tee -a "$LOG"
echo >> "$LOG"

# ─── 3) Sube de vuelta a OneDrive según el resultado ────────────────────────
# move = sube y limpia el inbox local. Solo si hay algo que subir.
if [ -d "$INBOX/_procesados" ] && [ -n "$(ls -A "$INBOX/_procesados" 2>/dev/null)" ]; then
  rclone move "$INBOX/_procesados" "$PROCESSED" \
    --transfers 4 --log-file "$LOG" --log-level INFO
fi
if [ -d "$INBOX/_fallidos" ] && [ -n "$(ls -A "$INBOX/_fallidos" 2>/dev/null)" ]; then
  rclone move "$INBOX/_fallidos" "$FAILED" \
    --transfers 4 --log-file "$LOG" --log-level INFO
fi
