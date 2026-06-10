/**
 * Seed de datos DEMO para generar los decks (skill `decks`).
 * Persona ficticia: Ana Reyes, fundadora de "Nébula Consultoría" (consultora de
 * transformación digital para PyMEs en Monterrey). NADA de datos reales.
 *
 * Corre contra la DB LOCAL (.env.local → :5433). Idempotente.
 *   npx tsx tools/decks/seed-demo.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { query, toVectorLiteral } from "../../src/lib/db";
import { ensureTenancy } from "../../src/lib/tenancy";
import { embedDocument } from "../../src/lib/embeddings";

const DOMAIN = "nebulaconsultoria.mx";

interface Note {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  body: string;
  updatedAt: string; // ISO
  externalId?: string;
}

// ── Equipo (para la pantalla /admin) ────────────────────────────────────────
const TEAM = [
  { email: `diego.salinas@${DOMAIN}`, name: "Diego Salinas", role: "member" },
  { email: `mariana.tovar@${DOMAIN}`, name: "Mariana Tovar", role: "member" },
  { email: `pablo.cantu@${DOMAIN}`, name: "Pablo Cantú", role: "member" },
];

// ── Notas demo ──────────────────────────────────────────────────────────────
const NOTES: Note[] = [
  // ── Status por cliente ──
  {
    id: "status-grupo-lacteo",
    title: "Status — Grupo Lácteo del Valle",
    summary: "Implementación de tablero de ventas en marcha; falta capacitación al equipo comercial.",
    tags: ["status", "cliente/grupo-lacteo"],
    updatedAt: "2026-06-06T17:20:00.000Z",
    externalId: "status:grupo-lacteo",
    body: `# Status — Grupo Lácteo del Valle\n\n**Responsable Nébula:** Diego Salinas\n**Etapa:** Implementación (fase 2 de 3)\n**Salud del proyecto:** 🟢 En tiempo\n\n## Resumen\nEl tablero de ventas conectado a su ERP ya está en producción. Falta la capacitación al equipo comercial (8 personas) y cerrar el módulo de devoluciones.\n\n## Próximos pasos\n- [ ] Sesión de capacitación comercial — 12 jun\n- [ ] Validar módulo de devoluciones con Finanzas\n- [x] Migrar histórico de ventas 2024–2025\n\n## Contactos clave\n- Laura Fuentes — Directora Comercial (patrocinadora)\n- Ramón Ibarra — TI\n\nVer [[reunion-avance-grupo-lacteo]] y [[reunion-onboarding-grupo-lacteo]].`,
  },
  {
    id: "status-ferretera-mty",
    title: "Status — Ferretera Industrial Monterrey",
    summary: "Proyecto cerrado con éxito; en fase de soporte. Oportunidad de expansión a segunda sucursal.",
    tags: ["status", "cliente/ferretera-mty"],
    updatedAt: "2026-06-04T15:00:00.000Z",
    externalId: "status:ferretera-mty",
    body: `# Status — Ferretera Industrial Monterrey\n\n**Responsable Nébula:** Ana Reyes\n**Etapa:** Soporte / Post-venta\n**Salud del proyecto:** 🟢 Cerrado con éxito\n\n## Resumen\nSe entregó el catálogo digital y el portal de pedidos B2B. Adopción del 70% de clientes mayoristas en el primer mes.\n\n## Oportunidad\nEvalúan replicar la solución en su segunda sucursal (Saltillo). Mariana preparará propuesta.\n\nVer [[reunion-cierre-ferretera-mty]] y [[plantilla-propuesta-comercial]].`,
  },
  {
    id: "status-clinica-santa-barbara",
    title: "Status — Clínica Santa Bárbara",
    summary: "En propuesta. Esperan aprobación del consejo para digitalizar expedientes.",
    tags: ["status", "cliente/clinica-santa-barbara"],
    updatedAt: "2026-06-05T19:45:00.000Z",
    externalId: "status:clinica-santa-barbara",
    body: `# Status — Clínica Santa Bárbara\n\n**Responsable Nébula:** Ana Reyes\n**Etapa:** Propuesta enviada\n**Salud del proyecto:** 🟡 En espera de decisión\n\n## Resumen\nPropuesta para digitalizar expedientes clínicos y agenda de citas. El consejo decide el 18 de junio.\n\n## Riesgos\n- Sensibilidad de datos de pacientes → ver [[politica-retencion-datos]].\n- Presupuesto ajustado; ofrecimos plan por fases.\n\nVer [[reunion-propuesta-clinica-santa-barbara]].`,
  },
  {
    id: "status-aceros-del-norte",
    title: "Status — Aceros del Norte",
    summary: "Kickoff recién hecho. Levantamiento de procesos de inventario en curso.",
    tags: ["status", "cliente/aceros-del-norte"],
    updatedAt: "2026-06-07T16:10:00.000Z",
    externalId: "status:aceros-del-norte",
    body: `# Status — Aceros del Norte\n\n**Responsable Nébula:** Diego Salinas\n**Etapa:** Descubrimiento\n**Salud del proyecto:** 🟢 Arrancando\n\n## Resumen\nProyecto de control de inventario en planta. Kickoff realizado; levantando procesos actuales con jefes de almacén.\n\n## Próximos pasos\n- [ ] Mapa de procesos de almacén — 16 jun\n- [ ] Definir KPIs de rotación con Mariana\n\nVer [[reunion-kickoff-aceros-del-norte]] y [[reunion-seguimiento-aceros]].`,
  },
  {
    id: "status-cafe-altura",
    title: "Status — Café Altura",
    summary: "Descubrimiento inicial; quieren e-commerce y trazabilidad de grano.",
    tags: ["status", "cliente/cafe-altura"],
    updatedAt: "2026-05-30T18:00:00.000Z",
    externalId: "status:cafe-altura",
    body: `# Status — Café Altura\n\n**Responsable Nébula:** Pablo Cantú\n**Etapa:** Descubrimiento\n**Salud del proyecto:** 🟡 Definiendo alcance\n\n## Resumen\nTostadora artesanal que busca vender en línea y dar trazabilidad del grano (de la finca a la taza). Alcance aún amplio; hay que acotar.\n\nVer [[reunion-descubrimiento-cafe-altura]] y [[idea-webinar-ia-pymes]].`,
  },

  // ── Resúmenes de reunión (estilo agente de Reuniones / Teams) ──
  {
    id: "reunion-kickoff-aceros-del-norte",
    title: "Reunión kickoff — Aceros del Norte (12 may 2026)",
    summary: "Arranque del proyecto de inventario. Se definió alcance, equipo y calendario de fase 1.",
    tags: ["reunión", "cliente/aceros-del-norte"],
    updatedAt: "2026-05-12T22:30:00.000Z",
    externalId: "teams:rec:demo-aceros-kickoff",
    body: `# Reunión kickoff — Aceros del Norte\n\n**Fecha:** 12 de mayo de 2026 · **Duración:** 58 min\n**Participantes:** Ana Reyes, Diego Salinas (Nébula) · Ing. Hugo Treviño, Sofía Lerma (Aceros del Norte)\n\n## Resumen\nReunión de arranque del proyecto de control de inventario en planta. Se alineó el objetivo: reducir mermas y tener visibilidad en tiempo real del acero en proceso.\n\n## Puntos tratados\n- Dolor principal: conteos manuales mensuales con 12% de error.\n- Quieren integrar con su sistema actual (SAP Business One).\n- Sofía será la contraparte técnica.\n\n## Acuerdos\n- Nébula entrega mapa de procesos el **16 jun**.\n- Diego agenda visita a planta la próxima semana.\n- KPI objetivo: bajar merma a < 4% en 6 meses.\n\nVer status: [[status-aceros-del-norte]].`,
  },
  {
    id: "reunion-avance-grupo-lacteo",
    title: "Reunión de avance — Grupo Lácteo del Valle (28 may 2026)",
    summary: "Demo del tablero de ventas. Aprobado para producción; se agenda capacitación.",
    tags: ["reunión", "cliente/grupo-lacteo"],
    updatedAt: "2026-05-28T21:00:00.000Z",
    externalId: "teams:rec:demo-lacteo-avance",
    body: `# Reunión de avance — Grupo Lácteo del Valle\n\n**Fecha:** 28 de mayo de 2026 · **Duración:** 41 min\n**Participantes:** Diego Salinas (Nébula) · Laura Fuentes, Ramón Ibarra (Grupo Lácteo)\n\n## Resumen\nSe presentó el tablero de ventas conectado al ERP. Laura aprobó pasarlo a producción.\n\n## Puntos tratados\n- El tablero carga ventas por ruta, producto y vendedor.\n- Ramón resolvió el acceso de solo lectura al ERP.\n\n## Acuerdos\n- Capacitar al equipo comercial el **12 jun**.\n- Cerrar el módulo de devoluciones en la siguiente iteración.\n\nVer status: [[status-grupo-lacteo]].`,
  },
  {
    id: "reunion-propuesta-clinica-santa-barbara",
    title: "Reunión de propuesta — Clínica Santa Bárbara (3 jun 2026)",
    summary: "Presentación de propuesta de expediente digital. Decisión del consejo el 18 jun.",
    tags: ["reunión", "cliente/clinica-santa-barbara"],
    updatedAt: "2026-06-03T20:15:00.000Z",
    externalId: "teams:rec:demo-clinica-propuesta",
    body: `# Reunión de propuesta — Clínica Santa Bárbara\n\n**Fecha:** 3 de junio de 2026 · **Duración:** 49 min\n**Participantes:** Ana Reyes (Nébula) · Dr. Esteban Ríos, Lic. Norma Aguilar (Clínica)\n\n## Resumen\nSe presentó la propuesta de expediente clínico digital + agenda de citas. Buena recepción; el consejo decide el 18 de junio.\n\n## Puntos tratados\n- Preocupación por la seguridad de datos de pacientes.\n- Norma pidió plan por fases para ajustar presupuesto.\n\n## Acuerdos\n- Enviar adenda con plan por fases.\n- Compartir [[politica-retencion-datos]] al consejo.\n\nVer status: [[status-clinica-santa-barbara]].`,
  },
  {
    id: "reunion-cierre-ferretera-mty",
    title: "Reunión de cierre — Ferretera Industrial Monterrey (20 may 2026)",
    summary: "Entrega final del portal B2B. Cliente satisfecho; abre puerta a sucursal Saltillo.",
    tags: ["reunión", "cliente/ferretera-mty"],
    updatedAt: "2026-05-20T23:00:00.000Z",
    externalId: "teams:rec:demo-ferretera-cierre",
    body: `# Reunión de cierre — Ferretera Industrial Monterrey\n\n**Fecha:** 20 de mayo de 2026 · **Duración:** 35 min\n**Participantes:** Ana Reyes, Mariana Tovar (Nébula) · Don Gerardo Páez (Dueño), Iván Páez (Operaciones)\n\n## Resumen\nEntrega formal del catálogo digital y portal de pedidos B2B. 70% de adopción en el primer mes. Cliente muy satisfecho.\n\n## Acuerdos\n- Iniciar soporte mensual.\n- Mariana cotiza réplica en sucursal Saltillo.\n\nVer status: [[status-ferretera-mty]].`,
  },
  {
    id: "reunion-descubrimiento-cafe-altura",
    title: "Reunión de descubrimiento — Café Altura (26 may 2026)",
    summary: "Exploración inicial. Quieren e-commerce + trazabilidad. Alcance por acotar.",
    tags: ["reunión", "cliente/cafe-altura"],
    updatedAt: "2026-05-26T19:30:00.000Z",
    externalId: "teams:rec:demo-cafe-descubrimiento",
    body: `# Reunión de descubrimiento — Café Altura\n\n**Fecha:** 26 de mayo de 2026 · **Duración:** 44 min\n**Participantes:** Pablo Cantú (Nébula) · Renata Ozuna (Fundadora, Café Altura)\n\n## Resumen\nRenata quiere vender café en línea y mostrar la trazabilidad del grano. Visión amplia; hay que acotar a un MVP.\n\n## Acuerdos\n- Pablo propone MVP: tienda en línea + página de origen por lote.\n- Revisar en 2 semanas.\n\nVer status: [[status-cafe-altura]].`,
  },
  {
    id: "reunion-seguimiento-aceros",
    title: "Reunión de seguimiento — Aceros del Norte (4 jun 2026)",
    summary: "Avance del levantamiento de procesos de almacén. Se detectaron 3 cuellos de botella.",
    tags: ["reunión", "cliente/aceros-del-norte"],
    updatedAt: "2026-06-04T22:00:00.000Z",
    externalId: "teams:rec:demo-aceros-seguimiento",
    body: `# Reunión de seguimiento — Aceros del Norte\n\n**Fecha:** 4 de junio de 2026 · **Duración:** 38 min\n**Participantes:** Diego Salinas, Mariana Tovar (Nébula) · Sofía Lerma (Aceros del Norte)\n\n## Resumen\nRevisión del levantamiento de procesos. Se identificaron 3 cuellos de botella en recepción de material.\n\n## Acuerdos\n- Mariana define KPIs de rotación.\n- Cerrar mapa de procesos el 16 jun.\n\nVer [[reunion-kickoff-aceros-del-norte]] y [[status-aceros-del-norte]].`,
  },
  {
    id: "reunion-comite-interno",
    title: "Comité interno Nébula — Pipeline semanal (8 jun 2026)",
    summary: "Revisión de pipeline. Prioridad: cerrar Clínica Santa Bárbara y expandir Ferretera.",
    tags: ["reunión", "interno"],
    updatedAt: "2026-06-08T16:00:00.000Z",
    externalId: "teams:rec:demo-comite-interno",
    body: `# Comité interno Nébula — Pipeline semanal\n\n**Fecha:** 8 de junio de 2026 · **Duración:** 30 min\n**Participantes:** Ana Reyes, Diego Salinas, Mariana Tovar, Pablo Cantú\n\n## Resumen\nRevisión semanal del pipeline y carga de cada quien.\n\n## Decisiones\n- Prioridad de la semana: cerrar [[status-clinica-santa-barbara]].\n- Mariana avanza propuesta de Saltillo ([[status-ferretera-mty]]).\n- Pablo acota MVP de [[status-cafe-altura]].\n- Ana revisa [[tarifario-2026]] antes del consejo de la clínica.`,
  },

  // ── Conocimiento / procesos ──
  {
    id: "plantilla-propuesta-comercial",
    title: "Plantilla de propuesta comercial",
    summary: "Estructura estándar para propuestas a cliente: contexto, alcance, fases, inversión.",
    tags: ["proceso", "plantilla"],
    updatedAt: "2026-04-18T17:00:00.000Z",
    body: `# Plantilla de propuesta comercial\n\nEstructura estándar de Nébula para toda propuesta:\n\n1. **Contexto y reto** — el problema del cliente en sus palabras.\n2. **Objetivo medible** — qué cambia y cómo se mide.\n3. **Alcance por fases** — descubrimiento → implementación → soporte.\n4. **Entregables** por fase.\n5. **Inversión** — ver [[tarifario-2026]].\n6. **Equipo** asignado.\n7. **Calendario** estimado.\n\n> Tip: siempre ofrecer plan por fases si el presupuesto es ajustado.`,
  },
  {
    id: "checklist-onboarding-cliente",
    title: "Checklist de onboarding de cliente",
    summary: "Pasos para arrancar un proyecto nuevo: accesos, contrato, kickoff, canal de comunicación.",
    tags: ["proceso", "interno"],
    updatedAt: "2026-04-22T18:30:00.000Z",
    body: `# Checklist de onboarding de cliente\n\n- [ ] Contrato firmado y anticipo recibido\n- [ ] Crear carpeta del cliente en OneDrive (ObsiAgent)\n- [ ] Agendar reunión de kickoff\n- [ ] Definir contraparte técnica del cliente\n- [ ] Crear canal de comunicación (Teams/WhatsApp)\n- [ ] Asignar responsable Nébula\n- [ ] Crear nota de status del cliente\n\nVer [[plantilla-propuesta-comercial]].`,
  },
  {
    id: "tarifario-2026",
    title: "Tarifario 2026",
    summary: "Tarifas por tipo de servicio: descubrimiento, implementación, soporte mensual.",
    tags: ["interno", "finanzas"],
    updatedAt: "2026-01-15T16:00:00.000Z",
    body: `# Tarifario 2026 (interno)\n\n| Servicio | Modalidad | Rango |\n|---|---|---|\n| Descubrimiento | Proyecto fijo | $45k – $80k MXN |\n| Implementación | Por fase | desde $120k MXN |\n| Soporte | Mensual | $15k – $30k MXN |\n| Capacitación | Por sesión | $8k MXN |\n\n> Confidencial. Usar como base para [[plantilla-propuesta-comercial]].`,
  },
  {
    id: "politica-retencion-datos",
    title: "Política de retención y privacidad de datos",
    summary: "Cómo Nébula maneja datos sensibles de clientes y de sus usuarios finales.",
    tags: ["proceso", "legal"],
    updatedAt: "2026-03-10T15:30:00.000Z",
    body: `# Política de retención y privacidad de datos\n\n- Datos de clientes se almacenan cifrados y con acceso por rol.\n- Datos sensibles (salud, finanzas) → acuerdo de confidencialidad específico.\n- Retención: 24 meses tras cierre del proyecto, luego anonimización.\n- Cumplimiento con la LFPDPPP (México).\n\nRelevante para [[status-clinica-santa-barbara]].`,
  },
  {
    id: "guia-de-marca-nebula",
    title: "Guía de marca Nébula",
    summary: "Identidad visual y tono de voz de Nébula Consultoría.",
    tags: ["interno", "marca"],
    updatedAt: "2026-02-02T17:45:00.000Z",
    body: `# Guía de marca Nébula\n\n**Tono:** cercano, claro, sin tecnicismos innecesarios. Hablamos como aliado, no como proveedor.\n\n**Colores:** violeta profundo + acento cian. Fondo oscuro para presentaciones.\n\n**Promesa:** "Tecnología que tu PyME sí entiende y sí usa."\n\nResponsable: Pablo Cantú.`,
  },

  // ── Notas rápidas (estilo creadas por WhatsApp) ──
  {
    id: "idea-webinar-ia-pymes",
    title: "Idea: webinar de IA para PyMEs",
    summary: "Webinar gratuito para generar leads; invitar a clientes actuales como casos de éxito.",
    tags: ["idea", "marketing"],
    updatedAt: "2026-06-02T14:20:00.000Z",
    externalId: "whatsapp:demo-idea-webinar",
    body: `# Idea: webinar de IA para PyMEs\n\n_(capturada por WhatsApp)_\n\nHacer un webinar gratuito "IA práctica para tu PyME". Invitar a [[status-ferretera-mty]] como caso de éxito. Pablo arma el guion, Mariana mide leads.\n\nPosible fecha: julio.`,
  },
  {
    id: "recordatorio-renovar-dominio",
    title: "Recordatorio: renovar dominio nebulaconsultoria.mx",
    summary: "El dominio vence el 28 de junio; renovar antes.",
    tags: ["pendiente", "interno"],
    updatedAt: "2026-06-01T09:10:00.000Z",
    externalId: "whatsapp:demo-recordatorio-dominio",
    body: `# Recordatorio: renovar dominio\n\n_(capturada por WhatsApp)_\n\nEl dominio **nebulaconsultoria.mx** vence el **28 de junio**. Renovar por 2 años. Responsable: Ana.`,
  },
];

async function main() {
  if (!process.env.DATABASE_URL?.includes("5433")) {
    throw new Error(
      `SEGURIDAD: DATABASE_URL no apunta al puerto local 5433 (${process.env.DATABASE_URL}). Abortando para no tocar prod.`
    );
  }
  console.log("→ Asegurando esquema + empresa/superadmin demo…");
  await ensureTenancy();

  const company = (
    await query<{ id: string; name: string }>(
      `select id, name from companies where name = $1`,
      [process.env.BOOTSTRAP_COMPANY]
    )
  )[0];
  if (!company) throw new Error("No se creó la empresa demo");

  // Persona demo (la superadmin sembrada) con nombre humano.
  const owner = (
    await query<{ id: string }>(
      `update users set name = 'Ana Reyes' where email = $1 returning id`,
      [process.env.SUPERADMIN_EMAIL]
    )
  )[0];
  if (!owner) throw new Error("No se encontró el usuario superadmin demo");
  console.log(`  empresa=${company.name}  owner=Ana Reyes (${owner.id})`);

  // Equipo (para /admin)
  for (const m of TEAM) {
    await query(
      `insert into users (company_id, email, name, role) values ($1,$2,$3,$4)
       on conflict (email) do update set name = excluded.name`,
      [company.id, m.email, m.name, m.role]
    );
  }
  console.log(`  equipo: ${TEAM.length} miembros`);

  // Notas (con embedding real de Voyage)
  let i = 0;
  for (const n of NOTES) {
    i++;
    const text = `${n.title}\n\n${n.summary}\n\n${n.body}`;
    const emb = await embedDocument(text);
    await query(
      `insert into notes (id, path, title, summary, tags, content, embedding, company_id, owner_user_id, external_id, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,null,$9,$10,$10)
       on conflict (id) do update set
         title=excluded.title, summary=excluded.summary, tags=excluded.tags,
         content=excluded.content, embedding=excluded.embedding,
         company_id=excluded.company_id, external_id=excluded.external_id,
         updated_at=excluded.updated_at`,
      [
        n.id,
        `${n.id}.md`,
        n.title,
        n.summary,
        n.tags,
        n.body,
        toVectorLiteral(emb),
        company.id,
        n.externalId ?? null,
        n.updatedAt,
      ]
    );
    // Enlaces [[wikilink]] → tabla links
    await query(`delete from links where source = $1`, [n.id]);
    const targets = [...n.body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
    for (const t of targets) {
      await query(
        `insert into links (source, target) values ($1,$2) on conflict do nothing`,
        [n.id, t]
      );
    }
    process.stdout.write(`  notas: ${i}/${NOTES.length}\r`);
  }
  console.log(`\n  ${NOTES.length} notas indexadas (con embeddings + enlaces)`);

  // Conexión OneDrive empresarial "conectada" (para /config y RightRail)
  await query(
    `insert into onedrive_connections (company_id, owner_user_id, account, folder, last_sync)
     values ($1, null, $2, 'ObsiAgent', $3)
     on conflict (company_id) where owner_user_id is null
     do update set account = excluded.account, last_sync = excluded.last_sync`,
    [
      company.id,
      `ana.reyes@${DOMAIN}`,
      JSON.stringify({ at: "2026-06-07T15:30:00.000Z", ok: 18, failed: 0 }),
    ]
  );
  console.log("  OneDrive empresarial: conectado (demo)");

  console.log("\n✅ Seed demo completo.");
  process.exit(0);
}

main().catch((e) => {
  console.error("✖ Seed falló:", e);
  process.exit(1);
});
