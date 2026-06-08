// Iconos SVG (línea), estilo profesional. Heredan el color con currentColor
// y el tamaño se puede ajustar por CSS o con la prop width/height.
import type { SVGProps } from "react";

function svgProps(p: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...p,
  };
}

export function IconSearch(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function IconSun(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function IconMoon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

export function IconUpload(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 15V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function IconNotes(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

export function IconGraph(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="9" r="2.4" />
      <circle cx="9" cy="18" r="2.4" />
      <path d="M8.1 7.1 15.9 8M10.4 16.2 16 11M8.2 15.8 7 8.3" />
    </svg>
  );
}

export function IconBook(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v16H7.5A2.5 2.5 0 0 0 5 20.5Z" />
      <path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19v4H7.5A2.5 2.5 0 0 1 5 20.5Z" />
    </svg>
  );
}

export function IconLink(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M8 12 6 14a3.5 3.5 0 0 0 5 5l2-2" />
      <path d="M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2" />
    </svg>
  );
}

export function IconClose(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconCloudUpload(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="M7 18h10a3.5 3.5 0 0 0 .5-6.96 5.5 5.5 0 0 0-10.58-1.4A3.75 3.75 0 0 0 7 18Z" />
      <path d="M12 20v-7" />
      <path d="m9.2 15 2.8-2.8 2.8 2.8" />
    </svg>
  );
}

export function IconEdit(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z" />
      <path d="m13.5 6.5 3 3" />
    </svg>
  );
}

export function IconHome(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

export function IconSettings(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function IconUsers(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.5 14.3A5.5 5.5 0 0 1 20.5 19" />
    </svg>
  );
}

// Hub con satélites (para la página de agentes).
export function IconAgents(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="4" r="1.6" />
      <circle cx="19" cy="16" r="1.6" />
      <circle cx="5" cy="16" r="1.6" />
      <path d="M12 9V5.6M13.6 13.4 17.7 15.3M10.4 13.4 6.3 15.3" />
    </svg>
  );
}

export function IconLogout(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 12H3" />
      <path d="m6 8-4 4 4 4" />
    </svg>
  );
}

// Moneda con símbolo de dólar (costos / estimación).
export function IconCoins(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M14.6 9.2c-.5-.8-1.5-1.2-2.6-1.2-1.6 0-2.6.8-2.6 2 0 2.6 5.4 1.4 5.4 4 0 1.2-1 2-2.8 2-1.2 0-2.2-.5-2.7-1.3" />
    </svg>
  );
}

// Chevron hacia abajo (plegar / desplegar secciones).
export function IconChevron(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// Paleta de colores (tema / acento).
export function IconPalette(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...svgProps(p)}>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5c0-3.9-4-7.4-9-7.4Z" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="12" cy="7.5" r="1" />
      <circle cx="16.5" cy="10.5" r="1" />
    </svg>
  );
}

// Marca de la app (sparkle de 4 puntas, estilo "IA").
export function IconLogo(p: SVGProps<SVGSVGElement>) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 2c.55 4.7 2.3 6.45 7 7-4.7.55-6.45 2.3-7 7-.55-4.7-2.3-6.45-7-7 4.7-.55 6.45-2.3 7-7Z" />
    </svg>
  );
}
