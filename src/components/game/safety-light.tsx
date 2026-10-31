import type { RoomSafety } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Sicurezza della zona: nome e descrizione breve (Gestione → Mondo → Chat) */
export const SAFETY: Record<RoomSafety, { label: string; hint: string }> = {
  sicura: { label: "Zona sicura", hint: "Tranquilla: difficilmente succede qualcosa di brutto." },
  poco_sicura: { label: "Zona poco sicura", hint: "Meglio stare attenti: qualche guaio può capitare." },
  pericolosa: { label: "Zona pericolosa", hint: "Risse, furti e brutti incontri sono all'ordine del giorno." },
};

// le tre luci del semaforo, in ordine: verde, giallo, rosso
const LIGHTS: { key: RoomSafety; on: string }[] = [
  { key: "sicura", on: "bg-mint shadow-[0_0_6px_var(--mint)]" },
  { key: "poco_sicura", on: "bg-amber-400 shadow-[0_0_6px_var(--color-amber-400)]" },
  { key: "pericolosa", on: "bg-red-500 shadow-[0_0_6px_var(--color-red-500)]" },
];

/** Semaforo della sicurezza: si accende la luce della zona, le altre restano spente */
export function SafetyLight({ safety, className, size = "sm" }: { safety: RoomSafety; className?: string; size?: "sm" | "md" }) {
  const info = SAFETY[safety] ?? SAFETY.sicura;
  return (
    <span
      role="img"
      aria-label={info.label}
      title={`${info.label} · ${info.hint}`}
      className={cn("inline-flex shrink-0 items-center rounded-full border border-white/15 bg-night/80", size === "md" ? "gap-1.5 px-2 py-1" : "gap-1 px-1.5 py-0.5", className)}
    >
      {LIGHTS.map((l) => (
        <span key={l.key} className={cn("rounded-full", size === "md" ? "size-2.5" : "size-2", l.key === safety ? l.on : "bg-white/15")} />
      ))}
    </span>
  );
}
