"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import HeaderBar from "./HeaderBar";

/** Cascarón de la app: sidebar + barra superior + contenido. En /login muestra
 *  solo el contenido centrado (sin navegación). */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <div className="auth-shell">{children}</div>;
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <HeaderBar />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
