# obsiAgent — Guía para recrear el sistema desde cero

Documento para levantar obsiAgent en un servidor nuevo (o entender qué necesita).
La **fuente de verdad** del conocimiento son los archivos `.md` del *vault* de
Obsidian; Postgres es solo un índice (metadatos + embeddings + grafo de enlaces)
que se puede reconstruir con `reindex`.

---

## 1. Qué es y de qué piezas se compone

Plataforma web (Next.js) conectada a un *vault* de Obsidian que:
- **Ingiere y "digiere" documentos** (web, OneDrive, SharePoint, Teams, WhatsApp):
  Claude genera título/resumen/tags y propone enlaces `[[wikilink]]`.
- **Búsqueda semántica + RAG**: embeddings con Voyage AI en Postgres/pgvector;
  Claude responde citando notas.
- **6 agentes IA** (reuniones, status por cliente, buscador, curador, WhatsApp,
  enrutador) — página visual `/agentes`.
- **Multi-empresa (multi-tenant)** con login **Microsoft SSO**; bases empresarial
  y personal por usuario.
- **WhatsApp** vía Evolution API; **voz** vía Retell (teléfono) y OpenAI (audio).

```
Navegador ─┐
WhatsApp ──┤─► Next.js (contenedor :3000) ─► Postgres+pgvector (contenedor)
Teléfono ──┘            │                            │
              nginx (host, HTTPS) ──────────► Vault Obsidian (.md en disco)
              │
   APIs externas: Anthropic (Claude), Voyage (embeddings), Microsoft Graph
   (OneDrive/SharePoint/Teams + login SSO), Evolution (WhatsApp), OpenAI (audio),
   Retell (voz)
```

**Stack:** Next.js 15 (App Router, standalone) · Node 20 · Postgres 16 + pgvector
· Docker / docker compose · nginx (host) como reverse proxy con HTTPS.

---

## 2. Cuentas y API keys necesarias

| Servicio | Para qué | ¿Requerido? | Dónde se obtiene |
|---|---|---|---|
| **Anthropic (Claude)** | Digestión de docs, RAG, agentes | **Sí** | console.anthropic.com → API Keys |
| **Voyage AI** | Embeddings (búsqueda semántica) | **Sí** | dashboard.voyageai.com → API Keys |
| **Microsoft Entra (Azure AD)** app | Login SSO **y** OneDrive/SharePoint/Teams | **Sí** (login depende de esto) | portal.azure.com → Entra ID → App registrations |
| **Postgres + pgvector** | Índice (corre en Docker) | **Sí** | No es externo: lo levanta docker compose |
| **Evolution API** | WhatsApp | Opcional | Self-hosted (Docker). github.com/EvolutionAPI/evolution-api |
| **OpenAI** | Audio de WhatsApp (Whisper STT + TTS) | Opcional | platform.openai.com → API Keys |
| **Retell AI** | Agente de voz por teléfono/web | Opcional | dashboard.retellai.com |

> Sin Anthropic + Voyage + la app de Microsoft, el sistema no funciona (no hay
> login ni digestión). El resto es opcional según qué canales quieras activar.

---

## 3. Registro de la app en Microsoft Entra

El **mismo** registro de app cubre el login SSO y la conexión a OneDrive/Teams.

1. portal.azure.com → **Microsoft Entra ID** → **App registrations** → *New
   registration*.
2. **Supported account types**: cuentas de cualquier directorio organizacional **y
   personales** (la app usa la autoridad `/common`).
3. **Redirect URIs** (tipo *Web*) — agrega **las dos**:
   - `https://TU-DOMINIO/api/auth/callback`  ← login SSO
   - `https://TU-DOMINIO/api/onedrive/callback`  ← conectar OneDrive/SharePoint/Teams
4. **Certificates & secrets** → *New client secret* → copia el **valor** (es
   `MS_CLIENT_SECRET`; solo se ve una vez).
5. Copia **Application (client) ID** (`MS_CLIENT_ID`) y **Directory (tenant) ID**
   (`MS_TENANT_ID`).
6. **API permissions** (Microsoft Graph, *Delegated*): `openid`, `profile`,
   `email`, `offline_access`, `User.Read`, `Files.ReadWrite`,
   `Sites.Read.All`, `OnlineMeetings.Read`, `OnlineMeetingTranscript.Read.All`.
   Da **Grant admin consent**.

> Scopes usados por el código: login = todos los anteriores (identidad + Graph
> con `offline_access`), así una sola autorización al iniciar sesión deja
> OneDrive/Teams/SharePoint conectados y en `/config` solo se eligen carpetas y
> sitios. Si la cuenta/tenant rechaza esos scopes (outlook.com personal o falta
> de admin consent), el login reintenta solo con `openid profile email` y las
> integraciones se conectan después desde `/config` (OneDrive personal =
> `... User.Read Files.ReadWrite`; empresarial añade `OnlineMeetings.Read
> OnlineMeetingTranscript.Read.All Sites.Read.All`).

---

## 4. Infraestructura del servidor (VPS)

- **VPS** Ubuntu 22.04/24.04 (el actual: Hostinger KVM2, 2 vCPU / 8 GB / 100 GB).
- **Docker** + plugin **docker compose**.
- **DNS**: un registro **A** del dominio (p. ej. `obsiagent.tudominio.com`)
  apuntando a la IP del VPS.
- **nginx en el host** como reverse proxy → `proxy_pass http://127.0.0.1:3001;`
  (la app se publica solo en loopback, ver `docker-compose.yml`).
- **HTTPS** con Let's Encrypt (`certbot --nginx`).
- **Carpetas persistentes en el host** (montadas a los contenedores):
  - `/srv/obsiagent/vault` → vault `.md`
  - `/srv/obsiagent/inbox` → bandeja de importación masiva
  - volumen `pgdata` → datos de Postgres

Bloque nginx mínimo (host):
```nginx
server {
  server_name obsiagent.tudominio.com;
  client_max_body_size 50m;            # subir PDFs/docx grandes
  location / { proxy_pass http://127.0.0.1:3001; proxy_set_header Host $host; }
  # (certbot añade aquí el bloque 443 + certificados)
}
```

---

## 5. Variables de entorno (`.env`)

Copia `.env.example` a `.env` y complétalo. En despliegue con docker compose, el
`DATABASE_URL` y `OBSIDIAN_VAULT_PATH` los **sobreescribe** `docker-compose.yml`
(no hace falta tocarlos para Docker).

```bash
# ── Núcleo ──────────────────────────────────────────────────────────────
APP_DOMAIN=obsiagent.tudominio.com
PUBLIC_BASE_URL=https://obsiagent.tudominio.com   # usado para los redirect_uri OAuth
SESSION_SECRET=<cadena-larga-aleatoria>           # firma la cookie de sesión (HMAC)
SUPERADMIN_EMAIL=tu-correo@tuempresa.com          # se siembra como dueño inicial
BOOTSTRAP_COMPANY=TuEmpresa

# Para Docker estos los fija docker-compose.yml; para correr FUERA de Docker:
DATABASE_URL=postgres://obsi:obsi@localhost:5432/obsiagent
OBSIDIAN_VAULT_PATH=./vault-dev

# ── Claude (Anthropic) — REQUERIDO ──────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6                 # base/agentes
ANTHROPIC_DIGEST_MODEL=claude-haiku-4-5-20251001  # digerir docs (barato)
ANTHROPIC_ANSWER_MODEL=claude-haiku-4-5-20251001  # respuestas RAG

# ── Voyage — REQUERIDO (Claude no hace embeddings) ──────────────────────
VOYAGE_API_KEY=pa-...
VOYAGE_MODEL=voyage-3.5
VOYAGE_DIM=1024                                   # debe coincidir con vector(N) en db/schema.sql

# ── Microsoft (login SSO + OneDrive/Teams) — REQUERIDO para login ───────
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
MS_TENANT_ID=...

# ── Importación masiva / cron (token para /api/bulk-import, /api/reindex, etc.)
BULK_IMPORT_TOKEN=<cadena-larga-secreta>
INBOX_PATH=/data/inbox

# ── WhatsApp (Evolution) — opcional ─────────────────────────────────────
EVOLUTION_API_URL=http://host.docker.internal:8085
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=obsiagent
WHATSAPP_ALLOWED_NUMBERS=521XXXXXXXXXX            # coma-separado, sin "+". Vacío = todos (inseguro)

# ── OpenAI (audio WhatsApp) — opcional ──────────────────────────────────
OPENAI_API_KEY=sk-...

# ── Retell (voz) — opcional ─────────────────────────────────────────────
RETELL_API_KEY=...
RETELL_AGENT_ID=...
```

> `.env`, `.env.local` y los vaults están en `.gitignore` — **nunca** se suben.

---

## 6. Despliegue paso a paso (VPS con Docker)

```bash
# 1. Clonar
cd /root && git clone <URL-del-repo> obsiAgent && cd obsiAgent

# 2. Variables de entorno
cp .env.example .env && nano .env        # completar (sección 5)

# 3. Carpetas persistentes del host
mkdir -p /srv/obsiagent/vault /srv/obsiagent/inbox

# 4. Levantar todo (construye la imagen de la app y arranca Postgres)
docker compose up -d --build
```

- En el **primer arranque**, Postgres aplica `db/schema.sql` automáticamente
  (extensión `vector` + tablas + índices). Las columnas añadidas después
  (`external_id`, `source_rev`, `content_hash`, scopes...) se crean solas al
  arrancar la app (migración perezosa en `src/lib/tenancy.ts`). **No** se corre
  `npm run migrate` en Docker.
- Configura nginx + certbot (sección 4) para exponer HTTPS.

Verificar:
```bash
docker compose ps           # app y db "Up"/"healthy"
docker compose logs -f app  # ver arranque
```

---

## 7. Primer uso (bootstrap)

1. Entra a `https://TU-DOMINIO` → **Login con Microsoft**.
2. Inicia sesión con la cuenta de `SUPERADMIN_EMAIL`: queda como **superadmin**
   y se siembra la empresa `BOOTSTRAP_COMPANY`.
3. En **/admin** das de alta a otros usuarios (por email).
4. En **/config** conectas las fuentes:
   - **OneDrive** (personal y/o empresarial) → botón conectar (OAuth).
   - **SharePoint** (sitio + carpeta) en la conexión empresarial.
   - **Teams**: se lee la transcripción embebida en las grabaciones de OneDrive
     (no requiere config extra más allá de los permisos Graph).

---

## 8. Activar WhatsApp (opcional)

1. Levanta **Evolution API** (Docker aparte). La app lo alcanza por
   `EVOLUTION_API_URL` (en el VPS actual es otro proyecto Docker; se unen por una
   red externa — ver `networks.evo` en `docker-compose.yml`).
2. Crea una **instancia** y escanea el QR con el WhatsApp del negocio.
3. Configura el **webhook** de la instancia →
   `https://TU-DOMINIO/api/whatsapp/webhook`, evento **MESSAGES_UPSERT**.
4. En `.env`: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`,
   `WHATSAPP_ALLOWED_NUMBERS` (¡pon la allowlist!).

---

## 9. Operación diaria

**Desplegar cambios** (en el VPS):
```bash
cd /root/obsiAgent
git pull && docker compose up -d --build
```

**Reindexar** (si editas notas a mano en Obsidian, la DB se desincroniza):
```bash
docker compose exec app node -e "require('child_process')"   # o:
# desde host con tsx/local: npm run reindex
# o el endpoint: curl -X POST "https://TU-DOMINIO/api/reindex?token=$BULK_IMPORT_TOKEN"
```

**Importación masiva** (deja archivos en `/srv/obsiagent/inbox`):
```bash
curl -X POST "https://TU-DOMINIO/api/bulk-import?token=$BULK_IMPORT_TOKEN&limit=20"
```

**Crons recomendados** (en el host, con el token):
- Teams: `*/30 * * * * curl -X POST ".../api/teams/sync?token=$BULK_IMPORT_TOKEN"`
- OneDrive/SharePoint, status, curador, enrutador: endpoints equivalentes bajo
  `/api/.../run|sync` (ver scripts `sync-*.sh` del repo).

---

## 10. Desarrollo local

```bash
cp .env.example .env       # completa keys; OBSIDIAN_VAULT_PATH=./vault-dev
docker compose up -d db    # solo Postgres
npm install
npm run migrate            # crea extensión vector + tablas (fuera de Docker)
npm run dev                # http://localhost:3000
```
- Login local: las cookies son `Secure` solo en https; el código ya permite
  `http://localhost` (ver `cookieSecure()`).
- Puedes tunelizar la DB del VPS por SSH si quieres datos reales:
  `ssh -L 5432:127.0.0.1:5432 root@IP` (la DB solo escucha en loopback del VPS).

---

## 11. Notas y gotchas

- **Claude no genera embeddings** → se usa Voyage. Necesitas ambas keys.
- Si cambias el modelo de embeddings, ajusta `VOYAGE_DIM` **y** `vector(N)` en
  `db/schema.sql`, y reindexa.
- El **vault es la fuente de verdad**: respáldalo (`/srv/obsiagent/vault`). La DB
  se reconstruye con reindex; el vault no.
- `tools/` es scaffolding del skill *decks* (regenerable) y está **excluido del
  build** (`tsconfig.json` → `exclude: ["tools"]`). No lo metas en el build de la app.
- Acceso al VPS: si tu ISP no rutea a la región del VPS, usa una VPN
  (p. ej. Cloudflare WARP) para SSH / terminal del panel.
- Endpoints temporales de depuración (`/api/teams/debug`, `/api/admin/dedupe`)
  deben borrarse una vez validado todo.

---

## 12. Checklist rápido

- [ ] VPS con Docker + docker compose
- [ ] DNS (A) → IP del VPS; nginx + certbot (HTTPS)
- [ ] App de Microsoft Entra (2 redirect URIs + permisos Graph + secret)
- [ ] Keys: Anthropic, Voyage (requeridas); OpenAI/Retell/Evolution (según canal)
- [ ] `.env` completo (`SESSION_SECRET`, `SUPERADMIN_EMAIL`, `PUBLIC_BASE_URL`, ...)
- [ ] `mkdir -p /srv/obsiagent/{vault,inbox}`
- [ ] `docker compose up -d --build`
- [ ] Login con el superadmin → /admin (usuarios) → /config (fuentes)
- [ ] (Opcional) Evolution + webhook WhatsApp
- [ ] Crons de sync con `BULK_IMPORT_TOKEN`
