import { cn } from "@/lib/utils";
import { Palm } from "./palm";

function Birds({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
        <path d="M2 12 q5 -6 9 0 q4 -6 9 0" />
        <path d="M26 6 q4 -5 7 0 q3 -5 7 0" />
        <path d="M18 24 q3 -4 6 0 q3 -4 6 0" />
      </g>
    </svg>
  );
}

/**
 * Scena completa del tramonto: cielo, sole, oceano e palme.
 * Usata come sfondo della home e delle pagine di accesso.
 */
export function SunsetScene({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      {/* Cielo */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#1f1747_0%,#3b2d86_22%,#6c56c2_42%,#c27bc9_60%,#ff8fb3_72%,#ffb48c_80%,#ffd7a3_86%)]" />
      {/* Scie nel cielo */}
      <div className="absolute top-[18%] -left-[10%] h-px w-[70%] rotate-[-8deg] bg-gradient-to-r from-transparent via-flamingo/40 to-transparent" />
      <div className="absolute top-[30%] left-[30%] h-px w-[60%] rotate-[-4deg] bg-gradient-to-r from-transparent via-peach/30 to-transparent" />
      {/* Sole */}
      <div className="absolute bottom-[14%] left-1/2 size-[42vmin] -translate-x-1/2 translate-y-1/2 rounded-full bg-[radial-gradient(circle,#fff1c9_0%,#ffd39b_35%,rgb(255_160_140/0.35)_60%,transparent_72%)]" />
      {/* Oceano */}
      <div className="absolute inset-x-0 bottom-0 h-[14%] bg-[linear-gradient(to_bottom,#b98ad6_0%,#7d66c4_45%,#3f3285_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[14%] bg-[repeating-linear-gradient(to_bottom,transparent_0px,transparent_7px,rgb(255_220_200/0.12)_8px,transparent_10px)]" />
      {/* Riflesso del sole sull'acqua */}
      <div className="absolute bottom-0 left-1/2 h-[14%] w-[22vmin] -translate-x-1/2 bg-[linear-gradient(to_bottom,rgb(255_225_180/0.7),transparent)] blur-md" />

      <Birds className="absolute top-[38%] left-[12%] w-12 text-palm/70 sm:w-16" />
      <Birds className="absolute top-[26%] right-[22%] w-8 text-palm/50" />

      {/* Palme: a sinistra grandi, a destra più lontane */}
      <Palm className="absolute -bottom-2 -left-36 h-[58%] text-palm sm:-left-10 sm:h-[78%]" lean={26} />
      <Palm className="absolute -bottom-2 left-[10%] hidden h-[56%] text-palm/90 sm:block" lean={-14} />
      <Palm className="absolute -right-32 -bottom-2 h-[52%] text-palm sm:right-0 sm:h-[70%]" lean={-28} />
      <Palm className="absolute -bottom-2 right-[16%] hidden h-[44%] text-[#4a3a86]/80 md:block" lean={12} />
    </div>
  );
}

/** Sfondo più discreto per l'area di gioco: crepuscolo e palme in lontananza. */
export function DuskBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#161030_0%,#221a4d_45%,#3b2766_80%,#5a2f6e_100%)]" />
      <div className="absolute -bottom-40 left-1/2 size-[70vmax] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(255_143_179/0.28)_0%,rgb(255_180_140/0.12)_35%,transparent_65%)]" />
      <Palm className="absolute -bottom-4 -left-20 h-[60vh] text-[#2a1f52]/80" lean={24} />
      <Palm className="absolute -right-20 -bottom-4 h-[50vh] text-[#2a1f52]/70" lean={-22} />
    </div>
  );
}
