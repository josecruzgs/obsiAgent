/**
 * Renderiza un markdown de deck → PDF con la estética DARK CONCIERGE.
 * Glassmorphism + glow violeta→cyan, fuente Geist, A4 landscape.
 * Las imágenes se embeben en base64 (PDF portable).
 *
 *   node tools/decks/md2pdf.mjs decks/01-pitch.md decks/01-pitch.pdf
 */
import { readFileSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";
import { marked } from "./node_modules/marked/lib/marked.esm.js";
import playwright from "./node_modules/playwright/index.js";
const { chromium } = playwright;

const [, , mdPath, pdfPath] = process.argv;
if (!mdPath || !pdfPath) {
  console.error("uso: node md2pdf.mjs <entrada.md> <salida.pdf>");
  process.exit(1);
}
const mdDir = dirname(resolve(mdPath));
const raw = readFileSync(mdPath, "utf8");

// ── Frontmatter ──
let title = "",
  subtitle = "";
let body = raw;
const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
if (fm) {
  body = raw.slice(fm[0].length);
  for (const line of fm[1].split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m && m[1] === "title") title = m[2];
    if (m && m[1] === "subtitle") subtitle = m[2];
  }
}

// ── Slides ──
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
function inlineImages(html) {
  return html.replace(/src="([^"]+)"/g, (full, src) => {
    if (src.startsWith("data:") || /^https?:/.test(src)) return full;
    try {
      const file = resolve(mdDir, src);
      const b64 = readFileSync(file).toString("base64");
      const mime = MIME[extname(file).toLowerCase()] || "image/png";
      return `src="data:${mime};base64,${b64}"`;
    } catch {
      console.warn(`  ! no encontré la imagen ${src}`);
      return full;
    }
  });
}

const chunks = body.split(/\r?\n---\r?\n/);
const types = new Set();
let pageNo = 0;
const slidesHtml = chunks
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => {
    const tm = chunk.match(/<!--\s*slide:([\w-]+)\s*-->/);
    const type = tm ? tm[1] : "content";
    types.add(type);
    const md = chunk.replace(/<!--\s*slide:[\w-]+\s*-->/, "").trim();
    const inner = inlineImages(marked.parse(md));
    const numbered = !["cover", "section", "end"].includes(type);
    if (numbered) pageNo++;
    const foot = numbered
      ? `<div class="foot"><span class="dot"></span><span class="num">${String(pageNo).padStart(2, "0")}</span></div>`
      : "";
    return `<section class="slide s-${type}"><div class="inner">${inner}</div>${foot}</section>`;
  })
  .join("\n");

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');
:root{
  --bg:#0A0612; --surface:#15101F; --ink:#F4F4F5; --muted:#A79FB5;
  --violet:#A78BFA; --cyan:#22D3EE; --border:rgba(255,255,255,0.08);
  --glass:rgba(255,255,255,0.045);
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{size:A4 landscape;margin:0;}
html,body{background:var(--bg);color:var(--ink);font-family:'Geist','Inter Tight',system-ui,sans-serif;}
.slide{
  position:relative;width:297mm;height:210mm;overflow:hidden;
  padding:20mm 24mm;display:flex;flex-direction:column;justify-content:center;
  background:var(--bg);page-break-after:always;break-after:page;
}
.slide:last-child{page-break-after:auto;}
.inner{position:relative;z-index:2;width:100%;}
h1,h2,h3{font-weight:600;line-height:1.05;letter-spacing:-0.02em;}
p{line-height:1.55;color:#D9D4E3;}
strong{color:var(--violet);font-weight:600;}
em{color:var(--cyan);font-style:italic;}
a{color:var(--cyan);text-decoration:none;}

/* Footer */
.foot{position:absolute;left:24mm;bottom:13mm;z-index:3;display:flex;align-items:center;gap:8px;}
.foot .dot{width:9px;height:9px;border-radius:50%;background:linear-gradient(135deg,var(--violet),var(--cyan));box-shadow:0 0 10px var(--violet);}
.foot .num{font-family:'Geist Mono',monospace;font-size:12px;color:var(--muted);letter-spacing:0.1em;}

/* COVER */
.s-cover{background:
  radial-gradient(1200px 700px at 78% 18%, rgba(167,139,250,0.40), transparent 60%),
  radial-gradient(900px 600px at 22% 90%, rgba(34,211,238,0.26), transparent 60%),
  var(--bg);}
.s-cover h1{font-size:104px;font-weight:500;letter-spacing:-0.04em;line-height:0.98;}
.s-cover h2{font-size:34px;font-weight:400;color:#fff;margin-top:14px;max-width:78%;}
.s-cover p{font-size:18px;color:var(--muted);margin-top:30px;max-width:62%;}
.s-cover::after{content:"";position:absolute;inset:0;z-index:1;
  background:radial-gradient(60% 60% at 50% 50%, transparent 70%, rgba(10,6,18,0.5));}

/* SECTION */
.s-section{align-items:flex-start;background:
  radial-gradient(900px 600px at 80% 30%, rgba(167,139,250,0.18), transparent 60%),
  var(--surface);}
.s-section h1{font-size:80px;font-weight:500;
  background:linear-gradient(100deg,var(--violet),var(--cyan));
  -webkit-background-clip:text;background-clip:text;color:transparent;}
.s-section h2{font-size:23px;font-weight:400;color:var(--muted);margin-top:18px;}

/* CONTENT */
.s-content h2{font-size:40px;color:#fff;margin-bottom:24px;}
.s-content ul,.s-content ol{list-style:none;display:flex;flex-direction:column;gap:14px;}
.s-content li{position:relative;padding-left:26px;font-size:20px;line-height:1.5;color:#D9D4E3;}
.s-content li::before{content:"";position:absolute;left:4px;top:11px;width:8px;height:8px;border-radius:50%;
  background:linear-gradient(135deg,var(--violet),var(--cyan));box-shadow:0 0 8px rgba(167,139,250,0.8);}
.s-content blockquote{margin-top:26px;padding:18px 24px;border-left:3px solid var(--violet);
  background:var(--glass);border-radius:10px;font-size:21px;font-style:italic;color:#EDE9F5;}
.s-content table{width:100%;border-collapse:separate;border-spacing:0;margin-top:10px;font-size:18px;
  border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.s-content th{background:rgba(167,139,250,0.16);color:#fff;text-align:left;padding:13px 18px;font-weight:600;}
.s-content td{padding:13px 18px;border-top:1px solid var(--border);color:#D9D4E3;}
.s-content tr:nth-child(even) td{background:rgba(255,255,255,0.02);}

/* QUOTE */
.s-quote{background:
  radial-gradient(700px 500px at 50% 50%, rgba(34,211,238,0.16), transparent 60%),var(--surface);
  align-items:center;text-align:center;}
.s-quote blockquote{font-size:46px;font-weight:500;font-style:italic;line-height:1.18;color:#fff;
  max-width:80%;margin:0 auto;text-shadow:0 0 40px rgba(34,211,238,0.35);}
.s-quote blockquote p{color:#fff;}

/* STATS */
.s-stats h2{font-size:38px;color:#fff;margin-bottom:30px;}
.s-stats ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:18px;}
.s-stats li{padding:24px 26px;border:1px solid var(--border);border-radius:16px;background:var(--glass);
  font-size:18px;color:var(--muted);}
.s-stats li strong{display:block;font-size:60px;font-weight:600;color:#fff;letter-spacing:-0.03em;margin-bottom:4px;
  background:linear-gradient(120deg,var(--violet),var(--cyan));-webkit-background-clip:text;background-clip:text;color:transparent;}

/* SCREENSHOT */
.s-screenshot{padding:16mm 20mm;}
.s-screenshot h2{font-size:32px;color:#fff;margin-bottom:14px;}
.s-screenshot .shot{display:flex;justify-content:center;}
.s-screenshot img{max-height:128mm;max-width:100%;border-radius:14px;border:1px solid var(--border);
  box-shadow:0 30px 80px rgba(167,139,250,0.30),0 0 0 1px rgba(34,211,238,0.10);}
.s-screenshot p{font-size:16px;color:var(--muted);margin-top:14px;max-width:80%;}

/* END */
.s-end{background:
  radial-gradient(900px 650px at 50% 40%, rgba(167,139,250,0.34), transparent 60%),
  radial-gradient(700px 500px at 70% 90%, rgba(34,211,238,0.22), transparent 60%),var(--bg);
  align-items:flex-start;}
.s-end h1{font-size:76px;font-weight:500;letter-spacing:-0.03em;}
.s-end h2{font-size:26px;font-weight:400;color:var(--cyan);margin-top:14px;}
.s-end p{font-size:18px;color:var(--muted);margin-top:28px;}

/* two-col (por si se usa) */
.s-two-col .inner{display:flex;gap:34px;align-items:center;}
.s-two-col img{max-width:50%;border-radius:12px;border:1px solid var(--border);}
`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${slidesHtml}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.waitForTimeout(1200); // dar tiempo a las fuentes de Google
await page.pdf({
  path: pdfPath,
  width: "297mm",
  height: "210mm",
  printBackground: true,
  margin: { top: "0", bottom: "0", left: "0", right: "0" },
});

// Modo preview: captura cada slide como PNG para verificación visual.
if (process.env.DECK_PREVIEW) {
  const sections = await page.$$(".slide");
  for (let i = 0; i < sections.length; i++) {
    await sections[i].screenshot({
      path: `${pdfPath.replace(/\.pdf$/, "")}-preview-${String(i + 1).padStart(2, "0")}.png`,
    });
  }
  console.log(`  preview: ${sections.length} PNGs`);
}

await browser.close();
console.log(`✅ ${pdfPath}  ·  ${pageNo + 1} slides aprox  ·  tipos: ${[...types].join(", ")}`);
