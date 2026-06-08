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

  // Secreto para firmar la cookie de sesión (HMAC). Requerido para auth.
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  // Email del superadmin inicial (se siembra como dueño de la empresa iAgent).
  // Debe coincidir con la cuenta Microsoft con la que iniciarás sesión.
  get superadminEmail() {
    return optional("SUPERADMIN_EMAIL", "jose.gallardo@iagent.mx").toLowerCase();
  },
  // Nombre de la empresa inicial sembrada en el bootstrap.
  get bootstrapCompany() {
    return optional("BOOTSTRAP_COMPANY", "iAgent");
  },

  // URL pública de la app (para construir el redirect_uri de OAuth de OneDrive).
  get publicBaseUrl() {
    return optional("PUBLIC_BASE_URL", "https://obsiagent.iagent.mx").replace(
      /\/$/,
      ""
    );
  },
  // Credenciales de la app registrada en Microsoft Entra (OneDrive vía Graph).
  // Vacías hasta que el usuario las configure; los endpoints avisan si faltan.
  get microsoft() {
    return {
      clientId: optional("MS_CLIENT_ID"),
      clientSecret: optional("MS_CLIENT_SECRET"),
      // Tenant (Directory ID) para el token app-only de Teams (transcripciones).
      tenantId: optional("MS_TENANT_ID"),
    };
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
  // Modelo para los AGENTES (loop con herramientas). Por defecto hereda
  // ANTHROPIC_MODEL; ponlo en un modelo más capaz (p. ej. claude-opus-4-8) si
  // quieres mayor calidad en el razonamiento multi-paso.
  get anthropicAgentModel() {
    return optional("ANTHROPIC_AGENT_MODEL", this.anthropicModel);
  },

  // Retell AI: agente de voz (llamada web / teléfono). apiKey + id del agente.
  get retell() {
    return {
      apiKey: optional("RETELL_API_KEY"),
      agentId: optional("RETELL_AGENT_ID"),
    };
  },

  // OpenAI: SOLO para audio (Whisper STT + TTS) en WhatsApp. Claude no hace audio.
  get openai() {
    return {
      apiKey: optional("OPENAI_API_KEY"),
      sttModel: optional("OPENAI_STT_MODEL", "whisper-1"),
      ttsModel: optional("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
      ttsVoice: optional("OPENAI_TTS_VOICE", "alloy"),
    };
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
