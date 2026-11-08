"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstName } from "@/lib/format";
import type { CharacterItem } from "@/lib/market";
import { createClient } from "@/lib/supabase/client";

/** Pannello «Oggetti» della chat (in finestra): i consumabili da usare e gli oggetti da cedere a chi è in giocata */
export function ItemsPanel({
  roomId,
  characterId,
  others,
  onError,
}: {
  roomId: string;
  characterId: string;
  /** gli altri personaggi in giocata in questa chat */
  others: { character_id: string; name: string }[];
  onError: (e: string | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<CharacterItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  // cedere: oggetto e personaggio scelti
  const [giveItem, setGiveItem] = useState("");
  const [giveTo, setGiveTo] = useState("");
  const [given, setGiven] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("character_items").select("*").eq("character_id", characterId).order("name");
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

  async function give() {
    const it = (items ?? []).find((x) => String(x.id) === giveItem);
    const to = others.find((o) => o.character_id === giveTo);
    if (busy || !it || !to) return;
    if (!window.confirm(`Cedere «${it.name}» a ${firstName(to.name)}? Diventa suo${it.upkeep > 0 ? ", con la sua spesa mensile" : ""}.`)) return;
    setBusy(true);
    onError(null);
    setGiven(null);
    const { error } = await supabase.rpc("item_give", { p_character: characterId, p_item: it.id, p_room: roomId, p_to: to.character_id });
    setBusy(false);
    if (error) onError(error.message);
    else {
      setGiven(`Hai ceduto «${it.name}» a ${firstName(to.name)}.`);
      setGiveItem("");
    }
    load();
  }

  const usable = (items ?? []).filter((it) => it.charges_left !== null);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs tracking-wider text-peach uppercase">Usa</p>
      {items && usable.length === 0 && <p className="text-sm text-muted-foreground">Niente da usare. I consumabili si comprano in Utility → Mercato.</p>}
      <ul className="flex flex-wrap gap-2">
        {usable.map((it) => (
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

      <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-3">
        <p className="flex items-center gap-1.5 text-xs tracking-wider text-peach uppercase">
          <Gift className="size-3.5" /> Cedi a qualcuno
        </p>
        {items && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Non hai oggetti da cedere.</p>
        ) : others.length === 0 ? (
          <p className="text-sm text-muted-foreground">Non c’è nessun altro in giocata in questa chat.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={giveItem}
              onChange={(e) => setGiveItem(e.target.value)}
              aria-label="Oggetto da cedere"
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none focus-visible:border-ring"
            >
              <option value="">Quale oggetto?</option>
              {(items ?? []).map((it) => (
                <option key={it.id} value={String(it.id)}>
                  {it.name}
                  {it.charges_left !== null ? ` (${it.charges_left} ${it.charges_left === 1 ? "carica" : "cariche"})` : ""}
                </option>
              ))}
            </select>
            <select
              value={giveTo}
              onChange={(e) => setGiveTo(e.target.value)}
              aria-label="A chi"
              className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none focus-visible:border-ring"
            >
              <option value="">A chi?</option>
              {others.map((o) => (
                <option key={o.character_id} value={o.character_id}>
                  {firstName(o.name)}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" disabled={busy || !giveItem || !giveTo} onClick={give} className="rounded-full">
              <Gift /> Cedi
            </Button>
          </div>
        )}
        {given && <p className="text-xs text-mint">{given}</p>}
        <p className="text-[0.7rem] text-muted-foreground">Solo a chi è in giocata con te in questa chat. L’oggetto passa intero (con le cariche rimaste) e in chat si legge il passaggio.</p>
      </div>
    </div>
  );
}
