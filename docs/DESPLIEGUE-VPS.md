# Despliegue de obsiAgent en un VPS (Ubuntu/Debian) — paso a paso

Guía para principiantes. Vamos por fases; no avances a la siguiente hasta que la
actual funcione. Cada bloque de comandos se ejecuta **dentro del VPS** (por SSH),
salvo que diga "en tu PC".

> Convención: `<algo>` significa "reemplaza esto por tu valor real".

---

## Mapa general

| Fase | Qué haremos |
|---|---|
| 1 | Conectarte al VPS por SSH |
| 2 | Preparar el servidor (updates, Docker, Node, git) |
| 3 | Conseguir las API keys (Anthropic + Voyage) |
| 4 | Subir el código de obsiAgent al VPS |
| 5 | Levantar Postgres (pgvector) con Docker |
| 6 | Configurar `.env` y migrar la base de datos |
| 7 | Crear la carpeta del vault de Obsidian |
| 8 | Probar la app en local (puerto 3000) |
| 9 | Dominio + HTTPS (Caddy como reverse proxy) |
| 10 | Evolution API (WhatsApp) + webhook |
| 11 | Dejar la app corriendo 24/7 (pm2) |
| 12 | Sincronizar el vault con Obsidian de tu PC (opcional) |

---

## Fase 1 — Conectarte al VPS por SSH

1. En el **panel de tu proveedor** (Hetzner, DigitalOcean, Contabo, AWS, etc.)
   busca y anota:
   - **IP pública** del VPS (ej. `203.0.113.45`)
   - **Usuario** (normalmente `root`)
   - **Contraseña** (o la clave SSH si te dieron una)

2. En **tu PC Windows**, abre **PowerShell** y conéctate:
   ```powershell
   ssh root@<IP-de-tu-VPS>
   ```
   - La primera vez te dirá `Are you sure you want to continue connecting?` →
     escribe `yes` y Enter.
   - Te pedirá la contraseña (al escribir no se ve nada, es normal) → Enter.

3. Si ves algo como `root@vps:~#`, ¡estás dentro! 🎉

> ¿Error "ssh no se reconoce"? Instala el cliente OpenSSH:
> `Configuración → Aplicaciones → Características opcionales → Cliente OpenSSH`.

---

## Fase 2 — Preparar el servidor

Ejecuta dentro del VPS, uno por uno:

```bash
# Actualizar el sistema
apt update && apt upgrade -y

# Utilidades básicas
apt install -y curl git ufw

# Instalar Docker + plugin compose (script oficial)
curl -fsSL https://get.docker.com | sh

# Verificar
docker --version
docker compose version

# Instalar Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version    # debe decir v20.x
```

Firewall básico (abre SSH, HTTP y HTTPS):

```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
ufw status
```

---

## Fase 3 — Conseguir las API keys

### Anthropic (Claude) — para resúmenes y respuestas
1. Entra a https://console.anthropic.com
2. Crea cuenta / inicia sesión.
3. Menú **API Keys** → **Create Key** → cópiala (empieza con `sk-ant-...`).
4. Necesitas crédito: **Billing → Add credits** (con poco saldo, ej. $5, sobra
   para probar).
5. Guarda la key en un lugar seguro; la pondremos en `.env`.

### Voyage AI (embeddings) — para la búsqueda semántica
1. Entra a https://www.voyageai.com → **Sign up**.
2. Ve a **API Keys** → crea una (empieza con `pa-...`).
3. Voyage da un cupo gratuito mensual; suficiente para empezar.

> **Por qué dos servicios:** Claude (Anthropic) responde y resume, pero no genera
> "embeddings" (los vectores que permiten la búsqueda por significado). Anthropic
> recomienda Voyage AI justo para esa parte.

---

## Fase 4 — Subir el código al VPS

Tienes el proyecto en tu PC. La forma más limpia es por **GitHub**:

### Opción A — GitHub (recomendada)
**En tu PC** (PowerShell, dentro de la carpeta del proyecto):
```powershell
cd C:\Users\josec\Documents\Github\obsiAgent
git init
git add .
git commit -m "obsiAgent inicial"
# Crea un repo vacío en github.com (puede ser privado) y luego:
git remote add origin https://github.com/<tu-usuario>/obsiAgent.git
git branch -M main
git push -u origin main
```
**En el VPS**:
```bash
cd /opt
git clone https://github.com/<tu-usuario>/obsiAgent.git
cd obsiAgent
```

### Opción B — Copiar directo (sin GitHub)
**En tu PC** (PowerShell). Copia todo menos `node_modules` y `.next`:
```powershell
cd C:\Users\josec\Documents\Github
scp -r obsiAgent root@<IP>:/opt/obsiAgent
```
(Si `node_modules` ya existe localmente, bórralo antes para que la copia sea
rápida: `Remove-Item -Recurse -Force obsiAgent\node_modules`.)

Luego, en el VPS:
```bash
cd /opt/obsiAgent
npm install
```

---

## Fase 5 — Levantar Postgres (pgvector)

Dentro de `/opt/obsiAgent` en el VPS:
```bash
docker compose up -d db
docker compose ps          # debe aparecer "healthy" tras unos segundos
```

---

## Fase 6 — Configurar `.env` y migrar

```bash
cp .env.example .env
nano .env
```
Edita estos valores (guardar en nano: `Ctrl+O`, Enter; salir: `Ctrl+X`):
```
DATABASE_URL=postgres://obsi:obsi@localhost:5432/obsiagent
OBSIDIAN_VAULT_PATH=/opt/obsiagent-vault
ANTHROPIC_API_KEY=sk-ant-...        # tu key de Anthropic
VOYAGE_API_KEY=pa-...               # tu key de Voyage
```
(Lo de Evolution/WhatsApp lo llenamos en la Fase 10.)

Instala dependencias (si no lo hiciste) y migra la DB:
```bash
npm install
npm run migrate     # crea la extensión vector + tablas
```

---

## Fase 7 — Crear la carpeta del vault

El "vault de Obsidian" es solo una carpeta con archivos `.md`. La creamos:
```bash
mkdir -p /opt/obsiagent-vault
```
(Más adelante, en la Fase 12, la sincronizamos con la app de Obsidian de tu PC.)

---

## Fase 8 — Probar la app

```bash
npm run build
npm run start      # queda escuchando en el puerto 3000
```
Abre en tu navegador: `http://<IP-del-VPS>:3000`

> Si quieres verla por IP en este punto, abre el puerto temporalmente:
> `ufw allow 3000`. Lo cerramos cuando pongamos Caddy (Fase 9):
> `ufw delete allow 3000`.

Prueba **Ingerir** un texto: debería crear un `.md` en `/opt/obsiagent-vault` y
una fila en la DB. Detén la app con `Ctrl+C` para seguir con la Fase 9.

---

## Fase 9 — Dominio + HTTPS (Caddy)

1. Compra/usa un dominio (Namecheap, Cloudflare, etc.) o un subdominio gratis.
2. Crea un **registro DNS tipo A**:
   - `obsi.tudominio.com` → **IP de tu VPS**
   - (Opcional) `wa.tudominio.com` → misma IP (para Evolution)
3. Espera unos minutos a que propague (`ping obsi.tudominio.com`).

Instala **Caddy** (HTTPS automático):
```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

Configura el reverse proxy:
```bash
nano /etc/caddy/Caddyfile
```
Contenido (ajusta los dominios):
```
obsi.tudominio.com {
    reverse_proxy localhost:3000
}

# Descomenta cuando montes Evolution (Fase 10):
# wa.tudominio.com {
#     reverse_proxy localhost:8080
# }
```
Recarga Caddy:
```bash
systemctl reload caddy
```
Ahora tu app estará en `https://obsi.tudominio.com` con certificado válido.

---

## Fase 10 — Evolution API (WhatsApp)

1. En `/opt/obsiagent/docker-compose.yml`, **descomenta** el servicio
   `evolution-api` (ya está preparado en el archivo) y ponle una clave fuerte en
   `AUTHENTICATION_API_KEY`.
2. Levántalo:
   ```bash
   docker compose up -d evolution-api
   docker compose logs -f evolution-api    # Ctrl+C para salir de los logs
   ```
3. Crea una instancia y conéctala (desde el VPS, usando la API de Evolution):
   ```bash
   curl -X POST http://localhost:8080/instance/create \
     -H "apikey: <TU_AUTHENTICATION_API_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"instanceName":"obsiagent","integration":"WHATSAPP-BAILEYS","qrcode":true}'
   ```
   La respuesta trae un QR (en base64). Más fácil: abre el **manager** de
   Evolution en el navegador: `https://wa.tudominio.com/manager` (o
   `http://<IP>:8080/manager`), entra con tu API key, crea la instancia
   `obsiagent` y **escanea el QR con WhatsApp** (Dispositivos vinculados).
4. Configura el **webhook** de la instancia apuntando a tu app, con el evento
   `MESSAGES_UPSERT`:
   ```bash
   curl -X POST http://localhost:8080/webhook/set/obsiagent \
     -H "apikey: <TU_AUTHENTICATION_API_KEY>" \
     -H "Content-Type: application/json" \
     -d '{
       "webhook": {
         "enabled": true,
         "url": "https://obsi.tudominio.com/api/whatsapp/webhook",
         "events": ["MESSAGES_UPSERT"]
       }
     }'
   ```
5. Completa el `.env` de la app y reiníciala:
   ```
   EVOLUTION_API_URL=http://localhost:8080
   EVOLUTION_API_KEY=<TU_AUTHENTICATION_API_KEY>
   EVOLUTION_INSTANCE=obsiagent
   WHATSAPP_ALLOWED_NUMBERS=521XXXXXXXXXX   # tu número, formato internacional sin +
   ```

> **Seguridad:** llena `WHATSAPP_ALLOWED_NUMBERS` con tu(s) número(s). Si lo dejas
> vacío, cualquiera que escriba a esa instancia podrá consultar tu vault.

---

## Fase 11 — Dejar la app corriendo 24/7 (pm2)

```bash
npm install -g pm2
cd /opt/obsiagent
npm run build
pm2 start "npm run start" --name obsiagent
pm2 save
pm2 startup        # ejecuta el comando que te imprima (arranque al reiniciar)
```
Comandos útiles:
```bash
pm2 logs obsiagent     # ver logs
pm2 restart obsiagent  # reiniciar tras cambios (.env o git pull)
pm2 status
```

---

## Fase 12 — Sincronizar el vault con Obsidian (opcional)

El vault vive en `/opt/obsiagent-vault` (servidor). Para editarlo también desde
la app de Obsidian en tu PC, elige una opción:

- **Syncthing** (recomendado, gratis): sincroniza la carpeta del servidor con una
  carpeta local que abres como vault en Obsidian.
- **Git**: el vault como repo; `git pull/push` en ambos lados.
- **Obsidian Sync** (de pago): no incluye el servidor; tendrías que apuntar la app
  al directorio sincronizado.

Tras editar notas fuera de la web, reindexa la DB:
```bash
cd /opt/obsiagent && npm run reindex
```

---

## Verificación final (end-to-end)

1. `https://obsi.tudominio.com` carga el dashboard.
2. **Ingerir** un texto → aparece `.md` en `/opt/obsiagent-vault` y nota en `/graph`.
3. **Buscar** una pregunta → respuesta de Claude con fuentes.
4. Desde tu WhatsApp (número en la allowlist) escribe a la instancia → recibes la
   respuesta RAG.

## Comandos de diagnóstico

```bash
docker compose ps                 # estado de db / evolution
docker compose logs db            # logs de Postgres
pm2 logs obsiagent                # logs de la app
systemctl status caddy            # estado del reverse proxy
curl http://localhost:3000        # ¿responde la app localmente?
```
