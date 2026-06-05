// Carga y valida las variables de entorno usadas en el servidor.
// Importar este módulo solo desde código de servidor (API routes, scripts, libs).
//
// Los valores se resuelven de forma perezosa (getters): importar este módulo NO
// lanza, así `next build` funciona sin un .env completo. Una variable requerida
// solo lanza cuando se accede a ella en tiempo de ejecución.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get vaultPath() {
    return required("OBSIDIAN_VAULT_PATH");
  },

  // Bandeja de entrada para la importación masiva (/api/bulk-import).
  get inboxPath() {
    return optional("INBOX_PATH", "/data/inbox");
  },
  // Token requerido para disparar /api/bulk-import y /api/reindex.
  get bulkImportToken() {
    return optional("BULK_IMPORT_TOKEN");
  },

  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  get anthropicModel() {
    return optional("ANTHROPIC_MODEL", "claude-sonnet-4-6");
  },
  // Modelo para las RESPUESTAS de /search (RAG). Haiku = más rápido y barato.
  // La digestión de documentos sigue usando ANTHROPIC_MODEL (mejor calidad).
  get anthropicAnswerModel() {
    return optional("ANTHROPIC_ANSWER_MODEL", "claude-haiku-4-5-20251001");
  },

  get voyageApiKey() {
    return required("VOYAGE_API_KEY");
  },
  get voyageModel() {
    return optional("VOYAGE_MODEL", "voyage-3.5");
  },
  get voyageDim() {
    return parseInt(optional("VOYAGE_DIM", "1024"), 10);
  },

  get evolution() {
    return {
      url: optional("EVOLUTION_API_URL"),
      apiKey: optional("EVOLUTION_API_KEY"),
      instance: optional("EVOLUTION_INSTANCE", "obsiagent"),
    };
  },

  // Lista de números permitidos para consultar por WhatsApp (vacío = todos).
  get whatsappAllowedNumbers() {
    return optional("WHATSAPP_ALLOWED_NUMBERS")
      .split(",")
      .map((n) => n.replace(/\D/g, ""))
      .filter(Boolean);
  },
};
