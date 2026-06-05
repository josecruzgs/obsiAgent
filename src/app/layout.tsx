import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "obsiAgent",
  description: "Plataforma de conocimiento sobre Obsidian con IA y WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <div className="app">
          <Sidebar />
          <div className="main">
            <header className="topbar">
              <div>
                <div className="topbar-greeting">Hola 👋</div>
                <div className="topbar-sub">Tu base de conocimiento con IA</div>
              </div>
              <a href="/search">
                <button type="button">🔍 Buscar</button>
              </a>
            </header>
            <div className="content">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
