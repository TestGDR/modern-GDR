import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePlayer } from "@/lib/auth";
import { getDistrictsWithPlaces, getPlaceActivity } from "@/lib/data";
import type { DistrictWithPlaces } from "@/lib/types";

export const metadata: Metadata = { title: "Mappa" };

// Mappa stilizzata di Miami (viewBox 0 0 300 400):
// terraferma a sinistra, baia al centro, isola di Miami Beach a destra, oceano.
const mainland =
  "M0 0 L178 0 C172 60 184 120 170 168 C166 186 176 200 168 214 C158 244 150 272 136 318 C126 350 120 380 118 400 L0 400 Z";
const beachIsland =
  "M220 0 L240 0 C246 100 252 200 256 272 C254 282 244 288 238 286 C232 200 226 100 220 0 Z";
const causeways = ["M172 120 L226 118", "M170 176 L230 172", "M168 204 L236 214"];

export default function MappaPage() {
  return (
    <>
      <PageHeader title="Mappa di Miami" subtitle="Scegli un quartiere e raggiungi i suoi luoghi di gioco." />
      <Suspense fallback={<LoadingBlocks count={4} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePlayer();
  const [districts, activity] = await Promise.all([getDistrictsWithPlaces(), getPlaceActivity()]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="glass relative h-fit overflow-hidden rounded-3xl p-4 sm:p-6 lg:sticky lg:top-10">
        <MiamiMap districts={districts} />
      </div>

      <div className="flex flex-col gap-4">
        {districts.map((d) => (
          <section key={d.id} id={d.slug} className="glass scroll-mt-20 overflow-hidden rounded-2xl">
            <div className={`bg-gradient-to-r px-5 py-3 ${d.gradient}`}>
              {d.tagline && <p className="text-xs font-medium tracking-widest text-white/80 uppercase">{d.tagline}</p>}
              <h2 className="font-heading text-3xl tracking-wide text-white drop-shadow">{d.name}</h2>
            </div>
            <ul className="divide-y divide-border">
              {d.places.map((place) => {
                const active = activity.get(place.id) ?? 0;
                return (
                  <li key={place.id}>
                    <Link href={`/chat/${place.slug}`} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-white/5">
                      <div className="min-w-0">
                        <p className="font-medium">{place.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{place.description}</p>
                      </div>
                      {active > 0 && (
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-mint">
                          <span className="size-2 rounded-full bg-mint" /> {active}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function MiamiMap({ districts }: { districts: DistrictWithPlaces[] }) {
  return (
    <svg viewBox="0 0 300 400" className="relative mx-auto h-auto w-full max-w-sm rounded-2xl" role="img" aria-label="Mappa di Miami">
      <defs>
        <linearGradient id="water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b2d86" />
          <stop offset="100%" stopColor="#2b5f8a" />
        </linearGradient>
        <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b4bb5" />
          <stop offset="60%" stopColor="#c77dd1" />
          <stop offset="100%" stopColor="#ffb08a" />
        </linearGradient>
        <linearGradient id="beach" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c77dd1" />
          <stop offset="100%" stopColor="#ffd9a6" />
        </linearGradient>
      </defs>

      {/* Acqua: baia e oceano */}
      <rect width="300" height="400" fill="url(#water)" />
      <g stroke="#8fe3d1" strokeOpacity={0.3} fill="none" strokeWidth={1}>
        {[40, 110, 180, 250, 320, 380].map((y) => (
          <path key={y} d={`M262 ${y} q 6 -4 12 0 t 12 0 t 12 0`} />
        ))}
      </g>

      {/* Terraferma ed Everglades */}
      <path d={mainland} fill="url(#land)" fillOpacity={0.9} stroke="#ffd9a6" strokeOpacity={0.5} strokeWidth={1.2} />
      <path d="M0 290 C30 280 60 300 70 330 C76 360 60 390 60 400 L0 400 Z" fill="#8fe3d1" fillOpacity={0.28} />
      <g stroke="#8fe3d1" strokeOpacity={0.6} strokeWidth={1} strokeLinecap="round">
        {[[12, 318], [26, 334], [44, 312], [18, 370], [40, 382], [52, 350]].map(([x, y]) => (
          <path key={`${x}-${y}`} d={`M${x} ${y} l0 -6 M${x + 3} ${y} l1 -5 M${x - 3} ${y} l-1 -5`} />
        ))}
      </g>

      {/* Ponti, porto e Miami Beach */}
      <g stroke="#ffd9a6" strokeOpacity={0.7} strokeWidth={1.6} strokeDasharray="3 2">
        {causeways.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <ellipse cx="196" cy="208" rx="16" ry="5" fill="url(#beach)" />
      <path d={beachIsland} fill="url(#beach)" stroke="#fff" strokeOpacity={0.4} strokeWidth={1} />

      <text x="205" y="352" className="fill-white/50 font-heading text-[11px] tracking-[0.3em]" textAnchor="middle">
        Biscayne Bay
      </text>
      <text x="282" y="200" className="fill-white/50 font-heading text-[11px] tracking-[0.3em]" textAnchor="middle" transform="rotate(90 282 200)">
        Oceano Atlantico
      </text>

      {/* Quartieri */}
      {districts.map((d) => {
        const labelLeft = d.map_x > 180;
        return (
          <a key={d.id} href={`#${d.slug}`} aria-label={d.name}>
            <g className="cursor-pointer">
              <circle cx={d.map_x} cy={d.map_y} r={11} fill="#ff79b0" fillOpacity={0.25} className="animate-ping [transform-box:fill-box] [transform-origin:center]" />
              <circle cx={d.map_x} cy={d.map_y} r={5.5} fill="#ff79b0" stroke="#fff" strokeWidth={2} />
              <text
                x={labelLeft ? d.map_x - 10 : d.map_x + 10}
                y={d.map_y + 4}
                textAnchor={labelLeft ? "end" : "start"}
                className="fill-white font-heading text-[13px] tracking-wider"
                style={{ paintOrder: "stroke", stroke: "#1a1336", strokeWidth: 3 }}
              >
                {d.name}
              </text>
            </g>
          </a>
        );
      })}
    </svg>
  );
}
