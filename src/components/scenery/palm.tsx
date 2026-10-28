import { cn } from "@/lib/utils";

type Frond = { angle: number; length: number; droop: number; side: 1 | -1 };

// Una fronda: nervatura centrale curva + tante foglioline, tutto in un unico path.
function frondPath({ length: L, droop }: Frond) {
  const p1 = { x: L * 0.45, y: -L * 0.28 };
  const p2 = { x: L, y: L * droop };
  const point = (t: number) => ({
    x: 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: 2 * (1 - t) * t * p1.y + t * t * p2.y,
  });
  const tangent = (t: number) => {
    const x = 2 * (1 - t) * p1.x + 2 * t * (p2.x - p1.x);
    const y = 2 * (1 - t) * p1.y + 2 * t * (p2.y - p1.y);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  };

  const r = (n: number) => Math.round(n * 10) / 10;
  let d = `M0 0 Q${r(p1.x)} ${r(p1.y)} ${r(p2.x)} ${r(p2.y)}`;

  for (let t = 0.12; t <= 0.98; t += 0.055) {
    const p = point(t);
    const tg = tangent(t);
    const n = { x: -tg.y, y: tg.x }; // normale verso il basso
    const size = L * 0.3 * (1 - t * 0.65);
    // fogliolina inferiore (lunga, pende verso il basso)
    const lx = p.x + (tg.x * 0.55 + n.x) * size;
    const ly = p.y + (tg.y * 0.55 + n.y) * size;
    // fogliolina superiore (più corta)
    const ux = p.x + (tg.x * 0.7 - n.x * 0.8) * size * 0.6;
    const uy = p.y + (tg.y * 0.7 - n.y * 0.8) * size * 0.6;
    d += ` M${r(p.x)} ${r(p.y)} L${r(lx)} ${r(ly)} M${r(p.x)} ${r(p.y)} L${r(ux)} ${r(uy)}`;
  }
  return d;
}

const fronds: Frond[] = [
  { angle: -62, length: 95, droop: 0.15, side: 1 },
  { angle: -30, length: 120, droop: 0.32, side: 1 },
  { angle: 5, length: 125, droop: 0.42, side: 1 },
  { angle: 38, length: 105, droop: 0.45, side: 1 },
  { angle: -62, length: 95, droop: 0.15, side: -1 },
  { angle: -30, length: 118, droop: 0.32, side: -1 },
  { angle: 5, length: 122, droop: 0.42, side: -1 },
  { angle: 38, length: 100, droop: 0.45, side: -1 },
  { angle: -88, length: 70, droop: 0.3, side: 1 },
];

type PalmProps = {
  className?: string;
  /** Inclinazione del tronco (negativo = verso sinistra) */
  lean?: number;
};

/** Silhouette di palma. Il colore si imposta con text-* (usa currentColor). */
export function Palm({ className, lean = 18 }: PalmProps) {
  const crown = { x: 150 + lean, y: 140 };
  const trunk = `M142 500 C ${146 + lean * 0.2} 380 ${150 + lean * 1.1} 260 ${crown.x - 4} ${crown.y}
    L ${crown.x + 4} ${crown.y} C ${158 + lean * 1.1} 260 ${156 + lean * 0.2} 380 156 500 Z`;

  return (
    <svg
      viewBox="0 0 300 500"
      className={cn("text-palm", className)}
      aria-hidden="true"
      preserveAspectRatio="xMidYMax meet"
    >
      <path d={trunk} fill="currentColor" />
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3.2}
      >
        {fronds.map((f, i) => (
          <path
            key={i}
            d={frondPath(f)}
            transform={`translate(${crown.x} ${crown.y}) scale(${f.side} 1) rotate(${f.angle})`}
          />
        ))}
      </g>
      <ellipse cx={crown.x} cy={crown.y + 4} rx={9} ry={7} fill="currentColor" />
    </svg>
  );
}
