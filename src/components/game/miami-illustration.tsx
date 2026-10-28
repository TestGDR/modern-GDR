// Miami disegnata (viewBox 300x400): si vede finché lo staff non carica
// l'immagine della mappa. Terraferma a sinistra, baia, Miami Beach, oceano.
// I punti dei quartieri si sovrappongono in percentuale (x/300, y/400).

const mainland =
  "M0 0 L178 0 C172 60 184 120 170 168 C166 186 176 200 168 214 C158 244 150 272 136 318 C126 350 120 380 118 400 L0 400 Z";
const beachIsland = "M220 0 L240 0 C246 100 252 200 256 272 C254 282 244 288 238 286 C232 200 226 100 220 0 Z";
const keyBiscayne = "M196 318 C204 314 212 318 214 330 C216 346 210 360 204 362 C198 358 194 344 194 332 C194 326 194 320 196 318 Z";
const causeways = ["M172 120 L226 118", "M170 176 L230 172", "M168 204 L236 214", "M150 300 L198 326"];

export function MiamiIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 400" className={className} role="img" aria-label="Mappa di Miami">
      <defs>
        <linearGradient id="miami-water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b2d86" />
          <stop offset="100%" stopColor="#2b5f8a" />
        </linearGradient>
        <linearGradient id="miami-land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b4bb5" />
          <stop offset="60%" stopColor="#c77dd1" />
          <stop offset="100%" stopColor="#ffb08a" />
        </linearGradient>
        <linearGradient id="miami-beach" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c77dd1" />
          <stop offset="100%" stopColor="#ffd9a6" />
        </linearGradient>
      </defs>

      {/* Acqua: baia e oceano */}
      <rect width="300" height="400" fill="url(#miami-water)" />
      <g stroke="#8fe3d1" strokeOpacity={0.3} fill="none" strokeWidth={1}>
        {[40, 110, 180, 250, 320, 380].map((y) => (
          <path key={y} d={`M262 ${y} q 6 -4 12 0 t 12 0 t 12 0`} />
        ))}
      </g>

      {/* Terraferma ed Everglades */}
      <path d={mainland} fill="url(#miami-land)" fillOpacity={0.9} stroke="#ffd9a6" strokeOpacity={0.5} strokeWidth={1.2} />
      <path d="M0 290 C30 280 60 300 70 330 C76 360 60 390 60 400 L0 400 Z" fill="#8fe3d1" fillOpacity={0.28} />
      <g stroke="#8fe3d1" strokeOpacity={0.6} strokeWidth={1} strokeLinecap="round">
        {[[12, 318], [26, 334], [44, 312], [18, 370], [40, 382], [52, 350]].map(([x, y]) => (
          <path key={`${x}-${y}`} d={`M${x} ${y} l0 -6 M${x + 3} ${y} l1 -5 M${x - 3} ${y} l-1 -5`} />
        ))}
      </g>

      {/* Ponti, porto, Miami Beach e Key Biscayne */}
      <g stroke="#ffd9a6" strokeOpacity={0.7} strokeWidth={1.6} strokeDasharray="3 2">
        {causeways.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <ellipse cx="196" cy="208" rx="16" ry="5" fill="url(#miami-beach)" />
      <path d={beachIsland} fill="url(#miami-beach)" stroke="#fff" strokeOpacity={0.4} strokeWidth={1} />
      <path d={keyBiscayne} fill="url(#miami-beach)" stroke="#fff" strokeOpacity={0.4} strokeWidth={1} />

      <text x="232" y="390" className="fill-white/50 font-heading text-[11px] tracking-[0.3em]" textAnchor="middle">
        Biscayne Bay
      </text>
      <text x="282" y="200" className="fill-white/50 font-heading text-[11px] tracking-[0.3em]" textAnchor="middle" transform="rotate(90 282 200)">
        Oceano Atlantico
      </text>
    </svg>
  );
}
