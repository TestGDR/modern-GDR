"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CharacterItem } from "@/lib/market";
import { createClient } from "@/lib/supabase/client";

/** Pannello «Oggetti» della chat (in finestra): i consumabili con le cariche, da usare in giocata */
export function ItemsPanel({ roomId, characterId, onError }: { roomId: string; characterId: string; onError: (e: string | null) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<CharacterItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("character_items").select("*").eq("character_id", characterId).not("charges_left", "is", null).order("name");
    setItems((data ?? []) as CharacterItem[]);
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function use(it: CharacterItem) {
    if (busy) return;
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("item_use", { p_character: characterId, p_item: it.id, p_room: roomId });
    setBusy(false);
    if (error) onError(error.message);
    load();
  }

  return (
    <div className="flex flex-col gap-2">
      {items && items.length === 0 && <p className="text-sm text-muted-foreground">Niente da usare. I consumabili si comprano in Utility → Mercato.</p>}
      <ul className="flex flex-wrap gap-2">
        {(items ?? []).map((it) => (
          <li key={it.id}>
            <Button type="button" size="sm" variant="ghost" disabled={busy} className="rounded-full border border-white/15" onClick={() => use(it)} title={it.effect ? "Tiro di resistenza: se fallisce, il personaggio si altera" : undefined}>
              {it.name}
              <span className="text-xs text-muted-foreground">
                {it.charges_left} {it.charges_left === 1 ? "carica" : "cariche"}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-[0.7rem] text-muted-foreground">Usarlo consuma una carica e lo scrive in chat. Alcol e droghe: tiro di resistenza (VIG + Resistenza fisica + d10); se fallisce si sale di uno stadio.</p>
    </div>
  );
}
