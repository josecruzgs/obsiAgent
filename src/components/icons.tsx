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

// Marca de la app (sparkle de 4 puntas, estilo "IA").
export function IconLogo(p: SVGProps<SVGSVGElement>) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 2c.55 4.7 2.3 6.45 7 7-4.7.55-6.45 2.3-7 7-.55-4.7-2.3-6.45-7-7 4.7-.55 6.45-2.3 7-7Z" />
    </svg>
  );
}
