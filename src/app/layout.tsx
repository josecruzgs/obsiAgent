import type { Metadata } from "next";
import { Merriweather } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "obsiAgent",
  description: "Plataforma de conocimiento sobre Obsidian con IA y WhatsApp",
};

// Aplica el tema guardado antes del primer pintado (evita parpadeo).
const themeInit = `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.dataset.theme=t;var b=localStorage.getItem('bgTheme');if(b&&b!=='none')document.documentElement.dataset.bg=b;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-theme="dark" className={merriweather.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {/* Fondo animado (rayos + núcleo brillante). Decorativo, sin interacción. */}
        <div className="page-bg" aria-hidden="true">
          <div className="glows">
            <div className="core-cloud" />
          </div>
        </div>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
