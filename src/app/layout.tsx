import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

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
        <Nav />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
