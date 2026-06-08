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
  title: "ObsiAgent",
  description: "Plataforma de conocimiento sobre Obsidian con IA y WhatsApp",
  icons: {
    icon: "/images/logo.png",
    shortcut: "/images/logo.png",
    apple: "/images/logo.png",
  },
};

// Aplica el tema guardado antes del primer pintado (evita parpadeo).
const themeInit = `(function(){try{var d=document.documentElement;d.dataset.theme=localStorage.getItem('theme')||'dark';var b=localStorage.getItem('bgTheme');if(b&&b!=='none')d.dataset.bg=b;var a=localStorage.getItem('accent');if(a&&a!=='purple')d.dataset.accent=a;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

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
