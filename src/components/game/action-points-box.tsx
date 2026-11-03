"use client";

import { useCallback, useEffect, useState } from "react";
import { Minus, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Scheda → Abilità: azioni della settimana e pacchetto di PX che arriverà lunedì.
// Lo staff con personaggi.assegnare_px li vede su ogni scheda e li corregge (− / +).

type ActionPoints = {
  points: number;
  package: number;
  next_at: number | null;
  next_package: number | null;
  max_package: number;
  min_chars: number;
  earned: number;
  cap: number;
  last: { week: string; points: number; px: number } | null;
};

export function ActionPointsBox({ characterId, canAdjust = false }: { characterId: string; canAdjust?: boolean }) {
  const [data, setData] = useState<ActionPoints | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: d } = await createClient().rpc("my_action_points", { p_character: characterId });
    setData((d as ActionPoints | null) ?? null);
  }, [characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function adjust(delta: number) {
    setBusy(true);
    setError(null);
    const { error: e } = await createClient().rpc("action_points_adjust", { p_character: characterId, p_delta: delta });
    setBusy(false);
    if (e) setError(e.message);
    load();
  }

  if (!data) return null;
  const full = data.earned >= data.cap;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-sand/30 bg-sand/10 px-4 py-2 text-xs">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Star className="size-4 text-sand" />
        <span>
          Azioni questa settimana: <strong className="text-sand">{data.points}</strong>
        </span>
        <span className="text-muted-foreground">
          · pacchetto di lunedì: <strong className="text-foreground">{data.package} PX</strong>
          {data.next_at !== null && ` (a ${data.next_at} azioni diventa ${data.next_package} PX)`}
          {data.next_at === null && " (il massimo della settimana)"}
        </span>
        {canAdjust && (
          <span className="ml-auto inline-flex items-center gap-1">
            <span className="text-[0.65rem] text-muted-foreground">Correggi</span>
            <Button type="button" size="icon-xs" variant="ghost" disabled={busy || data.points === 0} aria-label="Togli un'azione" onClick={() => adjust(-1)}>
              <Minus />
            </Button>
            <Button type="button" size="icon-xs" variant="ghost" disabled={busy} aria-label="Aggiungi un'azione" onClick={() => adjust(1)}>
              <Plus />
            </Button>
          </span>
        )}
      </p>
      {error && <p className="text-destructive">{error}</p>}
      <p className="text-muted-foreground">
        Conta ogni azione di almeno {data.min_chars} caratteri con un altro personaggio in giocata. Ogni lunedì le azioni diventano PX (al massimo {data.max_package} a
        settimana) e il conteggio riparte.
        {data.last && ` Ultimo pacchetto: ${data.last.points} azioni → ${data.last.px} PX.`}
        {full ? " Hai raggiunto il tetto dei PX accumulati." : ` PX dai pacchetti finora: ${data.earned} su ${data.cap}.`}
      </p>
    </div>
  );
}
