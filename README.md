# obsiAgent

Plataforma web conectada a una carpeta (vault) de **Obsidian**. Permite:

- **Ingerir y "digerir"** documentos raw desde la web → Claude genera título,
  resumen, tags y propone enlaces `[[wikilink]]` a notas existentes.
- **Búsqueda semántica + RAG**: embeddings con Voyage AI en Postgres/pgvector;
  Claude responde citando las notas relevantes.
- **Grafo visual** de notas y sus conexiones.
- **Consultas por WhatsApp** vía **Evolution API** (RAG sobre el vault).

La **fuente de verdad** son los archivos `.md` del vault. Postgres es solo un
índice consultable (metadatos + embeddings + grafo) que puedes reconstruir.

## Arquitectura

```
Web UI ─┐
        ├─► Next.js API routes ─► lib/{vault,claude,embeddings,db,graph,rag,evolution}
WhatsApp┘                                   │
(Evolution API)                    Postgres + pgvector  ◄──► Vault Obsidian (.md)
```

## Requisitos

- Node.js 20+
- Docker (para Postgres + pgvector)
- API key de **Anthropic** (Claude) y de **Voyage AI** (embeddings)
- (Para WhatsApp) una instancia de **Evolution API**

## Puesta en marcha (local)

```bash
# 1. Variables de entorno
cp .env.example .env
#   edita .env: ANTHROPIC_API_KEY, VOYAGE_API_KEY, OBSIDIAN_VAULT_PATH, etc.

# 2. Base de datos
docker compose up -d db

# 3. Dependencias
npm install

# 4. Migración (crea extensión vector + tablas)
npm run migrate

# 5. App
npm run dev          # http://localhost:3000
```

> **Vault:** `OBSIDIAN_VAULT_PATH` apunta a la carpeta del vault. Si no existe,
> se crea al ingerir la primera nota. Por defecto usa `./vault-dev` para pruebas.

## Flujo de uso

1. **/ingest** — pega texto → se crea un `.md` en el vault + se indexa.
2. **/graph** — visualiza el grafo de notas y enlaces.
3. **/search** — pregunta en lenguaje natural; respuesta con fuentes.
4. **WhatsApp** — pregunta desde tu teléfono (ver abajo).

## Reindexar el vault

Si editas notas directamente en Obsidian, la DB se desincroniza. Reconstrúyela:

```bash
npm run reindex
```

## WhatsApp con Evolution API

1. Levanta Evolution API (servicio comentado en `docker-compose.yml`, o el tuyo).
2. Crea una instancia y escanea el QR con tu WhatsApp.
3. Configura el **webhook** de la instancia apuntando a:
   ```
   http://<tu-host>:3000/api/whatsapp/webhook
   ```
   con el evento **MESSAGES_UPSERT** habilitado.
4. Define en `.env`:
   - `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`
   - `WHATSAPP_ALLOWED_NUMBERS` — **importante**: lista de números autorizados a
     consultar el vault (coma-separado, formato internacional sin `+`). Si lo
     dejas vacío, cualquiera que escriba a la instancia podrá consultar tu vault.

Probar el webhook sin WhatsApp real:

```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "obsiagent",
    "data": {
      "key": { "remoteJid": "5215512345678@s.whatsapp.net", "fromMe": false },
      "message": { "conversation": "¿Qué notas tengo sobre presupuesto?" }
    }
  }'
```

(Para que envíe la respuesta de vuelta necesitas `EVOLUTION_API_URL` configurada
y la instancia conectada.)

## Despliegue en VPS

1. Clona el repo en el servidor; copia y completa `.env`.
2. `docker compose up -d db` y, si la usas allí, descomenta el servicio
   `evolution-api` en `docker-compose.yml`.
3. `npm install && npm run build && npm run migrate`.
4. `npm run start` (sirve en el puerto 3000). Coloca un reverse proxy
   (Nginx/Caddy) con HTTPS delante; Evolution debe poder alcanzar el webhook.
5. El `OBSIDIAN_VAULT_PATH` debe ser una ruta del servidor; sincroniza el vault
   ahí (Syncthing, git, montaje, etc.) si lo editas también desde tu PC.

## Variables de entorno

Ver [.env.example](.env.example). Claves:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión a Postgres+pgvector |
| `OBSIDIAN_VAULT_PATH` | Carpeta del vault (.md) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Claude (digestión + respuestas) |
| `VOYAGE_API_KEY` / `VOYAGE_MODEL` / `VOYAGE_DIM` | Embeddings (1024 = voyage-3.5) |
| `EVOLUTION_*` | WhatsApp vía Evolution API |
| `WHATSAPP_ALLOWED_NUMBERS` | Allowlist de números (seguridad) |

## Notas

- **Claude no genera embeddings**; por eso se usa Voyage AI. Necesitas ambas keys.
- Si cambias el modelo de embeddings, ajusta `VOYAGE_DIM` y la dimensión de
  `vector(N)` en `db/schema.sql`, y reindexa.
