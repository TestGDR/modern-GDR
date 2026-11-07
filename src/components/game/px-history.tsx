"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Scheda → Abilità → PX: tutti i guadagni e le spese dei PX (px_history)

type PxMove = { at: string | null; amount: number; source: string; label: string };
type PxHistoryData = { px: number; earned: number; spent: number; moves: PxMove[] };

/** pxNow: i PX attuali della scheda, così dopo un'assegnazione lo storico si ricarica */
export function PxHistory({ characterId, pxNow }: { characterId: string; pxNow: number }) {
  const [data, setData] = useState<PxHistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"tutti" | "guadagni" | "spese">("tutti");

  useEffect(() => {
    let alive = true;
    createClient()
      .rpc("px_history", { p_character: characterId })
      .then(({ data: d, error: e }) => {
        if (!alive) return;
        if (e) setError(e.message);
        else setData(d as PxHistoryData | null);
      });
    return () => {
      alive = false;
    };
  }, [characterId, pxNow]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Carico…</p>;
  const moves = data.moves.filter((m) => filter === "tutti" || (filter === "guadagni" ? m.amount > 0 : m.amount < 0));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-mint/30 bg-mint/10 px-4 py-2">
          <p className="text-[0.65rem] font-medium tracking-wider text-lavender uppercase">Guadagnati</p>
          <p className="font-heading text-2xl tracking-wide text-mint">+{data.earned}</p>
        </div>
        <div className="rounded-xl border border-flamingo/30 bg-flamingo/10 px-4 py-2">
          <p className="text-[0.65rem] font-medium tracking-wider text-lavender uppercase">Spesi</p>
          <p className="font-heading text-2xl tracking-wide text-peach">−{data.spent}</p>
        </div>
      </div>
      <div className="flex gap-1" role="tablist" aria-label="Filtra i movimenti">
        {(["tutti", "guadagni", "spese"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn("rounded-full px-3 py-1 text-xs capitalize", filter === f ? "bg-flamingo text-white" : "bg-white/10 text-muted-foreground hover:bg-white/20")}
          >
            {f}
          </button>
        ))}
      </div>
      {moves.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun movimento.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {moves.map((m, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm">
              <strong className={cn("w-16 shrink-0", m.amount > 0 ? "text-mint" : "text-peach")}>
                {m.amount > 0 ? "+" : "−"}
                {Math.abs(m.amount)}
              </strong>
              <span className="text-xs font-semibold text-lavender">{m.source}</span>
              <span className="min-w-0 flex-1 text-muted-foreground">{m.label}</span>
              {m.at && <span className="text-[0.65rem] text-muted-foreground">{formatDateTime(m.at)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
