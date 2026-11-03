"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Gestione → Punti azione (permesso personaggi.assegnare_px): i punti della settimana
// di tutti i personaggi, correzioni prima del lunedì e il pacchetto della settimana scorsa.

type Row = {
  character_id: string;
  name: string;
  px: number;
  points: number;
  adjusted: number;
  package: number;
  last_points: number | null;
  last_px: number | null;
  earned: number;
};

export function ActionPointsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("action_points_list");
    if (e) setError(e.message);
    setRows((data ?? []) as Row[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function adjust(r: Row, delta: number) {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc("action_points_adjust", { p_character: r.character_id, p_delta: delta });
    setBusy(false);
    if (e) setError(e.message);
    load();
  }

  if (!rows) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Un punto azione per ogni azione valida in chat (lunghezza minima e un altro personaggio in giocata). Ogni lunedì i punti della settimana diventano un pacchetto di PX secondo
        le fasce di Impostazioni del sistema. Qui si correggono i punti della settimana in corso prima del lunedì.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca un personaggio…"
        aria-label="Cerca un personaggio"
        className="h-9 rounded-lg border border-input bg-night/40 px-3 text-sm outline-none"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Personaggio</th>
              <th className="font-normal">Punti</th>
              <th className="font-normal">Pacchetto</th>
              <th className="font-normal">Correggi</th>
              <th className="font-normal">Settimana scorsa</th>
              <th className="font-normal">PX da spendere</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.character_id} className="border-t border-white/5">
                <td className="py-1">
                  <Link href={`/scheda/${r.character_id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="text-center">
                  {Math.max(0, r.points + r.adjusted)}
                  {r.adjusted !== 0 && (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      ({r.adjusted > 0 ? "+" : ""}
                      {r.adjusted})
                    </span>
                  )}
                </td>
                <td className={cn("text-center", r.package > 0 ? "text-sand" : "text-muted-foreground")}>{r.package} PX</td>
                <td className="text-center">
                  <span className="inline-flex gap-1">
                    <Button type="button" size="icon-xs" variant="ghost" disabled={busy} aria-label={`Togli un punto a ${r.name}`} onClick={() => adjust(r, -1)}>
                      <Minus />
                    </Button>
                    <Button type="button" size="icon-xs" variant="ghost" disabled={busy} aria-label={`Aggiungi un punto a ${r.name}`} onClick={() => adjust(r, 1)}>
                      <Plus />
                    </Button>
                  </span>
                </td>
                <td className="text-center text-xs text-muted-foreground">{r.last_points === null ? "—" : `${r.last_points} punti → ${r.last_px} PX`}</td>
                <td className="text-center">{r.px}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
