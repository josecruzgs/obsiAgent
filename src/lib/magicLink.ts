// Registro de magic links ya usados (single-use). En memoria del proceso: como
// los tokens expiran en 10 min, basta con recordar los jti consumidos un rato.
// (Si la app reinicia, los tokens vivos siguen siendo de un solo uso salvo que
//  se reinicie justo en su ventana; aceptable para este caso.)

const used: Map<string, number> =
  (globalThis as unknown as { __magicUsed?: Map<string, number> }).__magicUsed ??
  new Map<string, number>();
(globalThis as unknown as { __magicUsed?: Map<string, number> }).__magicUsed = used;

/** Marca el token como usado. Devuelve true si era la PRIMERA vez (válido),
 *  false si ya se había usado. `exp` es el epoch (segundos) de expiración. */
export function consumeJti(jti: string, exp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  // Limpieza perezosa de expirados.
  for (const [k, e] of used) if (e < now) used.delete(k);
  if (used.has(jti)) return false;
  used.set(jti, exp);
  return true;
}
