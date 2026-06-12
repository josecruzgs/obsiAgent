// Claves de API configurables desde /config (solo superadmin). Se guardan en la
// tabla app_settings (key = "env:<NOMBRE>") y se aplican como overrides en
// memoria sobre process.env (ver env.ts). El .env del servidor queda de
// fallback: así cada cliente mete sus propias claves sin acceso al servidor.
import { query } from "./db";
import { setEnvOverrides } from "./env";

export type SettingGroup = "ia" | "whatsapp" | "voz" | "microsoft";

export interface SettingDef {
  /** Nombre de la variable de entorno que espeja. */
  key: string;
  label: string;
  group: SettingGroup;
  /** true = nunca se devuelve el valor completo al cliente (solo un hint). */
  secret: boolean;
  placeholder?: string;
  help?: string;
}

export const SETTING_DEFS: SettingDef[] = [
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic (Claude) — API key",
    group: "ia",
    secret: true,
    placeholder: "sk-ant-…",
    help: "Digestión de documentos, agentes y respuestas. Se obtiene en console.anthropic.com.",
  },
  {
    key: "VOYAGE_API_KEY",
    label: "Voyage AI — API key",
    group: "ia",
    secret: true,
    placeholder: "pa-…",
    help: "Embeddings para la búsqueda semántica. Se obtiene en dash.voyageai.com.",
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI — API key (opcional)",
    group: "ia",
    secret: true,
    placeholder: "sk-…",
    help: "Solo para notas de voz en WhatsApp (Whisper STT + TTS).",
  },
  {
    key: "EVOLUTION_API_URL",
    label: "Evolution API — URL",
    group: "whatsapp",
    secret: false,
    placeholder: "https://evolution.tuservidor.com",
    help: "URL base de tu servidor Evolution API (v2).",
  },
  {
    key: "EVOLUTION_API_KEY",
    label: "Evolution API — API key",
    group: "whatsapp",
    secret: true,
    help: "La API key global de tu Evolution (AUTHENTICATION_API_KEY).",
  },
  {
    key: "EVOLUTION_INSTANCE",
    label: "Evolution — nombre de instancia",
    group: "whatsapp",
    secret: false,
    placeholder: "obsiagent",
  },
  {
    key: "RETELL_API_KEY",
    label: "Retell AI — API key (opcional)",
    group: "voz",
    secret: true,
    help: "Agente de voz (llamada web). Se obtiene en retellai.com.",
  },
  {
    key: "RETELL_AGENT_ID",
    label: "Retell AI — ID del agente",
    group: "voz",
    secret: false,
    placeholder: "agent_…",
  },
  {
    key: "MS_CLIENT_ID",
    label: "Microsoft Entra — Client ID",
    group: "microsoft",
    secret: false,
    help: "App registrada en Entra para el login y OneDrive/Teams/SharePoint.",
  },
  {
    key: "MS_CLIENT_SECRET",
    label: "Microsoft Entra — Client secret",
    group: "microsoft",
    secret: true,
  },
  {
    key: "MS_TENANT_ID",
    label: "Microsoft Entra — Tenant ID (opcional)",
    group: "microsoft",
    secret: false,
    help: "Solo para transcripciones de Teams (token app-only).",
  },
];

const PREFIX = "env:";
const KNOWN = new Set(SETTING_DEFS.map((d) => d.key));

let loaded = false;

// La tabla existe en db/schema.sql, pero se crea perezosamente por si la DB es
// anterior a que se añadiera.
async function ensureTable(): Promise<void> {
  await query(`
    create table if not exists app_settings (
      key        text primary key,
      value      jsonb not null,
      updated_at timestamptz default now()
    )
  `);
}

async function readDbValues(): Promise<Map<string, string>> {
  await ensureTable();
  const rows = await query<{ key: string; value: string | null }>(
    `select key, value #>> '{}' as value from app_settings where key like $1`,
    [`${PREFIX}%`]
  );
  const map = new Map<string, string>();
  for (const r of rows) {
    const name = r.key.slice(PREFIX.length);
    if (KNOWN.has(name) && r.value && r.value.trim() !== "") {
      map.set(name, r.value.trim());
    }
  }
  return map;
}

/** Carga los overrides desde la DB y los aplica en memoria (env.ts). */
export async function loadSettingsOverrides(): Promise<void> {
  const values = await readDbValues();
  setEnvOverrides(Object.fromEntries(values));
  loaded = true;
}

/** Idempotente: carga los overrides una sola vez (no lanza si la DB falla). */
export async function ensureSettingsLoaded(): Promise<void> {
  if (loaded) return;
  try {
    await loadSettingsOverrides();
  } catch (err) {
    console.error("[settings] No se pudieron cargar los overrides:", err);
  }
}

/**
 * Guarda un conjunto de claves (valor vacío o null = borrar el override y volver
 * al .env del servidor) y recarga los overrides en memoria.
 */
export async function saveSettings(
  values: Record<string, string | null>
): Promise<void> {
  await ensureTable();
  for (const [name, rawValue] of Object.entries(values)) {
    if (!KNOWN.has(name)) throw new Error(`Clave desconocida: ${name}`);
    let value = (rawValue ?? "").trim();
    if (name === "EVOLUTION_API_URL") value = value.replace(/\/+$/, "");
    if (value === "") {
      await query(`delete from app_settings where key = $1`, [PREFIX + name]);
    } else {
      await query(
        `insert into app_settings (key, value, updated_at)
         values ($1, to_jsonb($2::text), now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [PREFIX + name, value]
      );
    }
  }
  await loadSettingsOverrides();
}

export interface SettingStatus extends SettingDef {
  /** De dónde sale el valor efectivo: DB (/config), .env del servidor, o nadie. */
  source: "db" | "env" | "none";
  /** Valor completo solo si NO es secreto. */
  value: string;
  /** Para secretos configurados: "••••" + últimos 4 caracteres. */
  hint: string;
}

/** Estado de cada clave para la UI, con los secretos enmascarados. */
export async function settingsStatus(): Promise<SettingStatus[]> {
  const db = await readDbValues();
  return SETTING_DEFS.map((d) => {
    const fromDb = db.get(d.key);
    const fromEnv = process.env[d.key]?.trim() || "";
    const value = fromDb || fromEnv;
    return {
      ...d,
      source: fromDb ? "db" : fromEnv ? "env" : "none",
      value: d.secret ? "" : value,
      hint: d.secret && value ? `••••${value.slice(-4)}` : "",
    };
  });
}
