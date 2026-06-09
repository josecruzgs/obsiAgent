"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import HeaderBar from "./HeaderBar";
import RightRail from "./RightRail";

/** Cascarón de la app: sidebar + barra superior + contenido + rail derecho.
 *  En /login muestra solo el contenido centrado (sin navegación). */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <div className="auth-shell">{children}</div>;
  }

  // /voz es una pantalla de llamada a pantalla completa (móvil): sin navegación.
  if (pathname === "/voz") {
    return <>{children}</>;
  }

  // El grafo necesita todo el ancho: ahí no mostramos el rail derecho.
  const showRail = !pathname.startsWith("/graph");

  return (
    <div className={`app${showRail ? "" : " no-rail"}`}>
      <Sidebar />
      <div className="main">
        <HeaderBar />
        <div className="content">{children}</div>
      </div>
      {showRail && <RightRail />}
    </div>
  );
}
