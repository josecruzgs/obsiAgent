// Magic links de acceso: tokens CORTOS guardados en el servidor (un solo uso,
// 10 min). En memoria del proceso (un contenedor): como expiran rápido, basta.
// El enlace queda como /m/<id> (corto), sin el token firmado largo en la URL.

interface Entry {
  uid: string;
  exp: number; // epoch en segundos
}

const store: Map<string, Entry> =
  (globalThis as unknown as { __magicTokens?: Map<string, Entry> }).__magicTokens ??
  new Map<string, Entry>();
(globalThis as unknown as { __magicTokens?: Map<string, Entry> }).__magicTokens = store;

const TTL_SECONDS = 10 * 60;

/** Id corto (~12 chars) URL-safe a partir de bytes aleatorios. */
function shortId(): string {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Crea un token corto para un usuario y lo devuelve. */
export function createMagicToken(uid: string): string {
  const now = Math.floor(Date.now() / 1000);
  for (const [k, e] of store) if (e.exp < now) store.delete(k); // limpieza
  const id = shortId();
  store.set(id, { uid, exp: now + TTL_SECONDS });
  return id;
}

/** Consume el token (un solo uso). Devuelve el uid si es válido, o null. */
export function consumeMagicToken(id: string): string | null {
  const e = store.get(id);
  if (!e) return null;
  store.delete(id); // un solo uso
  if (e.exp < Math.floor(Date.now() / 1000)) return null;
  return e.uid;
}
