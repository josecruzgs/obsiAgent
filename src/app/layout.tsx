import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/TopNav";
import HeaderBar from "@/components/HeaderBar";

export const metadata: Metadata = {
  title: "obsiAgent",
  description: "Plataforma de conocimiento sobre Obsidian con IA y WhatsApp",
};

// Aplica el tema guardado antes del primer pintado (evita parpadeo).
const themeInit = `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <TopNav />
        <main className="shell">
          <HeaderBar />
          <div className="content">{children}</div>
        </main>
      </body>
    </html>
  );
}
