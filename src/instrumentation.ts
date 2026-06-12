// Hook de arranque de Next.js: se ejecuta una vez cuando el servidor inicia.
// Carga las claves de API guardadas en la DB (página /config) como overrides
// de process.env antes de servir tráfico. No lanza si la DB aún no responde.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSettingsLoaded } = await import("./lib/settings");
    await ensureSettingsLoaded();
  }
}
