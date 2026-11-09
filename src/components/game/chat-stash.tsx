"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL, type MarketCategory } from "@/lib/market";
import { createClient } from "@/lib/supabase/client";

/** Un oggetto nella cassa comune della chat (da room_stash_list) */
export type StashRow = {
  id: string;
  item_id: string;
  name: string;
  category: MarketCategory;
  image_url: string | null;
  charges: number | null;
  use_text: string;
  quantity: number;
  max_per_character: number | null;
  /** quanti ne ha già presi il mio personaggio */
  taken: number;
};

/** Contenuto della cassa comune, aggiornato in tempo reale */
export function useRoomStash(roomId: string, characterId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<StashRow[]>([]);
  const rowsRef = useRef<StashRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("room_stash_list", { p_room: roomId, p_character: characterId });
    if (data) setRows(data as StashRow[]);
  }, [supabase, roomId, characterId]);
  useEffect(() => {
    const channel = supabase
      .channel(`cassa:${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_stash", filter: `room_id=eq.${roomId}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "room_stash", filter: `room_id=eq.${roomId}` }, () => load())
      // le eliminazioni non si filtrano: si rilegge se l'oggetto era in questa cassa
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "room_stash" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (!id || rowsRef.current.some((r) => r.id === id)) load();
      })
      // collegato (anche dopo una caduta): si legge la cassa
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId, load]);
  return { rows, reload: load };
}

type CatalogItem = { id: string; name: string; category: MarketCategory; charges: number | null };

/** Finestra «Cassa comune»: chi è in giocata prende, lo staff (chat.cassa) riempie */
export function StashPanel({
  roomId,
  characterId,
  rows,
  canManage,
  joined,
  onChanged,
  onError,
}: {
  roomId: string;
  characterId: string;
  rows: StashRow[];
  canManage: boolean;
  joined: boolean;
  onChanged: () => void;
  onError: (e: string | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState(10);
  const [max, setMax] = useState("");

  useEffect(() => {
    if (!canManage) return;
    supabase
      .from("market_items")
      .select("id, name, category, charges")
      .eq("active", true)
      .order("category")
      .order("name")
      .then(({ data }) => setCatalog((data ?? []) as CatalogItem[]));
  }, [supabase, canManage]);

  async function run(fn: string, args: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    onChanged();
    if (error) {
      onError(error.message);
      return false;
    }
    return true;
  }

  async function add() {
    const m = max.trim() ? Math.max(1, Math.min(99, Number(max) || 1)) : null;
    if (await run("room_stash_add", { p_room: roomId, p_item: item, p_qty: Math.max(1, Math.min(999, qty || 1)), p_max: m })) setItem("");
  }

  const byCategory = catalog.reduce<Record<string, CatalogItem[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">La cassa è vuota.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const limitReached = r.max_per_character !== null && r.taken >= r.max_per_character;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-night/40 px-3 py-2">
                {r.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- immagini esterne del catalogo
                  <img src={r.image_url} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block text-[0.7rem] text-muted-foreground">
                    {CATEGORY_LABEL[r.category] ?? r.category} · {r.quantity} nella cassa
                    {r.max_per_character !== null && ` · massimo ${r.max_per_character} a testa (ne hai presi ${r.taken})`}
                  </span>
                </span>
                {canManage && (
                  <span className="flex items-center gap-0.5">
                    <Button type="button" size="icon-xs" variant="ghost" disabled={busy} onClick={() => run("room_stash_set", { p_stash: r.id, p_qty: r.quantity - 1, p_max: r.max_per_character })} aria-label="Uno in meno">
                      <Minus />
                    </Button>
                    <Button type="button" size="icon-xs" variant="ghost" disabled={busy} onClick={() => run("room_stash_set", { p_stash: r.id, p_qty: r.quantity + 1, p_max: r.max_per_character })} aria-label="Uno in più">
                      <Plus />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => window.confirm(`Togliere «${r.name}» dalla cassa?`) && run("room_stash_set", { p_stash: r.id, p_qty: 0 })}
                      className="text-flamingo"
                      aria-label="Togli dalla cassa"
                    >
                      <Trash2 />
                    </Button>
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !joined || limitReached}
                  onClick={() => run("room_stash_take", { p_room: roomId, p_character: characterId, p_stash: r.id })}
                  className="rounded-full"
                  title={!joined ? "Entra in giocata per prendere" : limitReached ? "Hai già preso il massimo" : undefined}
                >
                  <Hand /> Prendi
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[0.7rem] text-muted-foreground">Prendi un oggetto alla volta: finisce nei tuoi oggetti (si usa dal pulsante Oggetti) e in chat si legge chi l’ha preso.</p>

      {canManage && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
          <p className="text-xs tracking-wider text-peach uppercase">Riempi la cassa (staff)</p>
          <select
            value={item}
            onChange={(e) => setItem(e.target.value)}
            aria-label="Oggetto del catalogo"
            className="h-8 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none focus-visible:border-ring"
          >
            <option value="">Quale oggetto del catalogo?</option>
            {Object.entries(byCategory).map(([cat, list]) => (
              <optgroup key={cat} label={CATEGORY_LABEL[cat as MarketCategory] ?? cat}>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.charges !== null ? ` (${c.charges} ${c.charges === 1 ? "carica" : "cariche"})` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label className="flex flex-col gap-1">
              Quantità
              <input
                type="number"
                min={1}
                max={999}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="h-8 w-20 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none focus-visible:border-ring"
              />
            </label>
            <label className="flex flex-col gap-1">
              Massimo a testa (facoltativo)
              <input
                type="number"
                min={1}
                max={99}
                value={max}
                onChange={(e) => setMax(e.target.value)}
                placeholder="senza limite"
                className="h-8 w-32 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none focus-visible:border-ring"
              />
            </label>
            <Button type="button" size="sm" disabled={busy || !item} onClick={add} className="rounded-full">
              <Plus /> Metti nella cassa
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
