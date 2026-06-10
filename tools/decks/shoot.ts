/**
 * Captura screenshots autenticados de obsiAgent para los decks.
 * Mintea una cookie de sesión FIRMADA (HMAC con SESSION_SECRET) para la persona
 * demo — sin pasar por Microsoft SSO. Corre contra el dev server local.
 *
 *   npx tsx tools/decks/shoot.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { chromium } from "./node_modules/playwright/index.js";
import { query } from "../../src/lib/db";
import { signSession, SESSION_COOKIE } from "../../src/lib/session";

const BASE = process.env.DECK_BASE_URL || "http://localhost:3001";
const OUT = "decks/screenshots";

// Pantallas a capturar (orden = aparición en el deck).
const ROUTES: { file: string; path: string; clickNote?: string }[] = [
  { file: "01-home", path: "/" },
  { file: "02-notas-lista", path: "/notas" },
  { file: "03-notas-editor", path: "/notas", clickNote: "Status — Grupo Lácteo del Valle" },
  { file: "04-graph", path: "/graph" },
  { file: "05-config", path: "/config" },
  { file: "06-admin", path: "/admin" },
  { file: "07-ingest", path: "/ingest" },
  { file: "08-voz", path: "/voz" },
];

async function main() {
  // Persona demo (Ana Reyes, superadmin sembrada).
  const user = (
    await query<{ id: string; email: string; role: string }>(
      `select id, email, role from users where email = $1`,
      [process.env.SUPERADMIN_EMAIL]
    )
  )[0];
  if (!user) throw new Error("No se encontró el usuario demo. ¿Corriste el seed?");

  const token = await signSession({ uid: user.id, email: user.email, role: user.role });
  console.log(`→ Sesión minteada para ${user.email} (${user.role})`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "es-MX",
    timezoneId: "America/Monterrey",
  });
  await ctx.addCookies([
    {
      name: SESSION_COOKIE,
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const page = await ctx.newPage();
  for (const r of ROUTES) {
    const url = BASE + r.path;
    try {
      await page.goto(url, { waitUntil: "load", timeout: 30000 });
    } catch {
      console.warn(`  ! timeout navegando a ${r.path}, sigo`);
    }
    await page.waitForTimeout(1800);
    // Oculta el overlay de desarrollo de Next.js (badge "N / issues") para que
    // no salga en los screenshots del deck.
    await page
      .addStyleTag({
        content:
          "nextjs-portal,[data-nextjs-toast],[data-next-badge-root],#__next-build-watcher,#__next-prerender-indicator{display:none!important}",
      })
      .catch(() => {});
    if (r.clickNote) {
      try {
        await page.getByText(r.clickNote, { exact: false }).first().click({ timeout: 5000 });
        await page.waitForTimeout(1500);
      } catch {
        console.warn(`  ! no pude abrir la nota "${r.clickNote}"`);
      }
    }
    const out = `${OUT}/${r.file}.png`;
    await page.screenshot({ path: out, fullPage: true });
    console.log(`  ✓ ${r.file}  (${r.path})`);
  }

  await browser.close();
  console.log("\n✅ Screenshots listos en", OUT);
  process.exit(0);
}

main().catch((e) => {
  console.error("✖ Captura falló:", e);
  process.exit(1);
});
