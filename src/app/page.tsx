import Link from "next/link";
import { query } from "@/lib/db";
import { IconBook, IconLink, IconUpload, IconNotes, IconGraph } from "@/components/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const [notes] = await query<{ count: string }>(
      `select count(*)::text as count from notes`
    );
    const [links] = await query<{ count: string }>(
      `select count(*)::text as count from links`
    );
    return { notes: Number(notes?.count ?? 0), links: Number(links?.count ?? 0), ok: true };
  } catch {
    return { notes: 0, links: 0, ok: false };
  }
}

const ACTIONS = [
  {
    href: "/ingest",
    icon: <IconUpload />,
    bg: "rgba(108,92,231,0.14)",
    color: "#6c5ce7",
    title: "Ingerir",
    desc: "Sube PDF/Word o pega texto. La IA genera resumen, tags y enlaces.",
  },
  {
    href: "/notas",
    icon: <IconNotes />,
    bg: "rgba(0,184,148,0.16)",
    color: "#00b894",
    title: "Notas",
    desc: "Busca, abre, edita o borra tus notas con buscador y paginación.",
  },
  {
    href: "/graph",
    icon: <IconGraph />,
    bg: "rgba(255,140,66,0.18)",
    color: "#ff8c42",
    title: "Grafo",
    desc: "Visualiza cómo se conectan tus notas entre sí.",
  },
];

export default async function Home() {
  const stats = await getStats();

  return (
    <>
      <h1>Tu base de conocimiento</h1>
      <p className="subtitle">
        Ingiere documentos, deja que la IA los conecte y consúltalos desde la web
        o por WhatsApp.
      </p>

      {!stats.ok && (
        <div className="card">
          <p className="error">
            No se pudo conectar a la base de datos. Verifica que Postgres esté
            corriendo.
          </p>
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="stat-head">
            <span
              className="stat-icon"
              style={{ background: "rgba(108,92,231,0.16)", color: "#6c5ce7" }}
            >
              <IconBook />
            </span>
            Notas indexadas
          </div>
          <div className="stat-num">{stats.notes}</div>
          <div className="stat-foot">documentos en tu base de conocimiento</div>
        </div>
        <div className="stat">
          <div className="stat-head">
            <span
              className="stat-icon"
              style={{ background: "rgba(0,184,148,0.18)", color: "#00b894" }}
            >
              <IconLink />
            </span>
            Enlaces entre notas
          </div>
          <div className="stat-num">{stats.links}</div>
          <div className="stat-foot">conexiones detectadas por la IA</div>
        </div>
      </div>

      <h2 style={{ margin: "10px 0 14px" }}>¿Por dónde empiezo?</h2>
      <div className="actions">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="action">
            <div className="action-icon" style={{ background: a.bg, color: a.color }}>
              {a.icon}
            </div>
            <h3>{a.title}</h3>
            <p>{a.desc}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
