import Link from "next/link";

export default function Nav() {
  return (
    <nav className="nav">
      <span className="brand">🧠 obsiAgent</span>
      <Link href="/">Inicio</Link>
      <Link href="/ingest">Ingerir</Link>
      <Link href="/notas">Notas</Link>
      <Link href="/graph">Grafo</Link>
      <Link href="/search">Buscar</Link>
    </nav>
  );
}
