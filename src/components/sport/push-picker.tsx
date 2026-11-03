"use client";

import { cn } from "@/lib/utils";

// Spinta del momento, scelta premendo «Gareggia» o «Allenati».
// Le regole (usi per stagione, gare di fila, infortuni) le controlla il database.

export type Push = "prudent" | "normal" | "max";

export const PUSH_LABEL: Record<Push, string> = { prudent: "Prudente", normal: "Normale", max: "Al massimo" };

const PUSH_HINT: Record<Push, string> = {
  prudent: "−1 al tiro, nessun infortunio",
  normal: "come sempre",
  max: "+1 al tiro, infortunio più facile",
};

export function PushPicker({ value, onChange, left, disabled }: { value: Push; onChange: (p: Push) => void; left?: number | null; disabled?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Spinta">
      {(Object.keys(PUSH_LABEL) as Push[]).map((p) => {
        const off = disabled || (p === "max" && left === 0);
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            disabled={off}
            title={PUSH_HINT[p]}
            onClick={() => onChange(p)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[0.7rem] disabled:opacity-40",
              value === p ? (p === "max" ? "border-flamingo bg-flamingo/25 text-white" : p === "prudent" ? "border-mint bg-mint/20" : "border-lavender bg-lavender/15") : "border-white/10 hover:bg-white/5",
            )}
          >
            {PUSH_LABEL[p]}
            {p === "max" && typeof left === "number" && ` (${left})`}
          </button>
        );
      })}
    </span>
  );
}
