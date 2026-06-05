import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import HeaderBar from "@/components/HeaderBar";

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

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
    <html lang="es" data-theme="dark" className={openSans.variable}>
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
