"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modsText, timeLeft, type ActiveAlteration } from "@/lib/market";
import { createClient } from "@/lib/supabase/client";

/** Scheda → Caratteristiche: alcol, droghe e postumi in corso (proprietario e staff) */
export function AlterationSection({ characterId, canClear }: { characterId: string; canClear: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<ActiveAlteration[] | null>(null);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("character_alterations_get", { p_character: characterId });
    setList((data ?? []) as ActiveAlteration[]);
    setNow(Date.now());
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura e aggiornamento ogni minuto
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function clear(kind: string) {
    if (!window.confirm("Togliere l'alterazione e i postumi?")) return;
    await supabase.rpc("alteration_clear", { p_character: characterId, p_kind: kind });
    load();
  }

  if (!list || list.length === 0) return null;
  return (
    <section className="mt-8">
      <h3 className="mb-3 flex items-center gap-2 font-heading text-xl tracking-wide text-peach">
        <Wine className="size-5" /> Stato
      </h3>
      <ul className="flex max-w-2xl flex-col gap-2">
        {list.map((a) => (
          <li key={a.kind} className="rounded-xl border border-orchid/30 bg-orchid/10 p-3 text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <strong>{a.name}</strong>
              <span className="text-xs text-muted-foreground">
                {a.phase === "stadio" ? `${a.kind === "alcol" ? "Alcol" : "Droga"} · stadio ${a.stage} di 3` : "Postumi"} · da {a.source} · ancora {timeLeft(a.until, now)}
              </span>
              {canClear && (
                <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={() => clear(a.kind)}>
                  Togli
                </Button>
              )}
            </p>
            {a.text && <p className="text-xs text-lavender italic">{a.text}</p>}
            {modsText(a.mods) && <p className="mt-1 text-xs">Malus ai tiri: {modsText(a.mods)}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
