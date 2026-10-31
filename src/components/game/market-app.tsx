"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Package, ShoppingBag, Skull, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDollars } from "@/lib/bank";
import { CATEGORY_LABEL, modsText, type CharacterItem, type MarketCategory, type MarketItem } from "@/lib/market";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Utility → Mercato: negozio, mercato nero (solo gruppi "malavita") e i miei oggetti.
// Si paga con il conto in banca; i consumabili si usano dalla chat (pulsante Oggetti).

type Tab = "negozio" | "nero" | "miei";

export function MarketApp({ characterId }: { characterId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("negozio");
  const [items, setItems] = useState<MarketItem[] | null>(null);
  const [mine, setMine] = useState<CharacterItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [category, setCategory] = useState<MarketCategory | "">("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [it, inv, bank] = await Promise.all([
      supabase.from("market_items").select("*").eq("active", true).order("category").order("sort_order"),
      characterId ? supabase.from("character_items").select("*").eq("character_id", characterId).order("acquired_at", { ascending: false }) : Promise.resolve({ data: [] }),
      characterId ? supabase.from("bank_accounts").select("balance").eq("character_id", characterId).maybeSingle<{ balance: number }>() : Promise.resolve({ data: null }),
    ]);
    setItems((it.data ?? []) as MarketItem[]);
    setMine((inv.data ?? []) as CharacterItem[]);
    setBalance(bank.data?.balance ?? null);
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function buy(item: MarketItem, qty: number) {
    if (!characterId) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: e } = await supabase.rpc("market_buy", { p_character: characterId, p_item: item.id, p_qty: qty });
    setBusy(false);
    if (e) return setError(e.message);
    setInfo(`Comprato: ${item.name}${qty > 1 ? ` ×${qty}` : ""}. Lo trovi in «I miei oggetti».`);
    load();
  }
  async function discard(it: CharacterItem) {
    if (!window.confirm(`Buttare ${it.name}?`)) return;
    const { error: e } = await supabase.from("character_items").delete().eq("id", it.id);
    if (e) setError(e.message);
    load();
  }

  if (!items) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const hasBlack = items.some((i) => i.black_market);
  const shown = items.filter((i) => (tab === "nero" ? i.black_market : !i.black_market) && (!category || i.category === category));
  const categories = [...new Set(items.filter((i) => (tab === "nero" ? i.black_market : !i.black_market)).map((i) => i.category))];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 rounded-full bg-white/5 p-1">
          <TabButton active={tab === "negozio"} onClick={() => { setTab("negozio"); setCategory(""); }}>
            <ShoppingBag className="size-3.5" /> Negozi
          </TabButton>
          {hasBlack && (
            <TabButton active={tab === "nero"} onClick={() => { setTab("nero"); setCategory(""); }}>
              <Skull className="size-3.5" /> Mercato nero
            </TabButton>
          )}
          {characterId && (
            <TabButton active={tab === "miei"} onClick={() => setTab("miei")}>
              <Package className="size-3.5" /> I miei oggetti {mine.length > 0 && <span className="text-peach">{mine.length}</span>}
            </TabButton>
          )}
        </nav>
        {balance !== null && <span className="ml-auto rounded-full bg-sand/15 px-3 py-1 text-xs text-sand">Sul conto: {formatDollars(balance)}</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-mint">{info}</p>}

      {tab === "miei" ? (
        <section className="flex flex-col gap-2">
          {mine.length === 0 && <p className="text-sm text-muted-foreground">Non hai ancora niente.</p>}
          <p className="text-xs text-muted-foreground">Gli oggetti con le cariche si usano in chat, mentre sei in giocata, dal pulsante «Oggetti».</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {mine.map((it) => (
              <li key={it.id} className="glass flex items-center gap-3 rounded-xl p-2.5">
                <Thumb url={it.image_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{it.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {CATEGORY_LABEL[it.category]}
                    {it.charges_left !== null && ` · ${it.charges_left} ${it.charges_left === 1 ? "carica" : "cariche"}`}
                  </span>
                </span>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={`Butta ${it.name}`} onClick={() => discard(it)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          {tab === "nero" && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
              Roba che non si trova nei negozi. Si paga in contanti: in banca resta solo «Pagamento in contanti».
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            <CatButton active={!category} onClick={() => setCategory("")}>
              Tutto
            </CatButton>
            {categories.map((c) => (
              <CatButton key={c} active={category === c} onClick={() => setCategory(c)}>
                {CATEGORY_LABEL[c]}
              </CatButton>
            ))}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {shown.map((it) => (
              <ShopCard key={it.id} item={it} canBuy={!!characterId} busy={busy} onBuy={(q) => buy(it, q)} />
            ))}
          </ul>
          {!characterId && <p className="text-sm text-muted-foreground">Per comprare serve un personaggio approvato.</p>}
        </>
      )}
    </div>
  );
}

function ShopCard({ item, canBuy, busy, onBuy }: { item: MarketItem; canBuy: boolean; busy: boolean; onBuy: (qty: number) => void }) {
  const [qty, setQty] = useState(1);
  return (
    <li className={cn("glass flex flex-col gap-2 rounded-xl p-3", item.black_market && "border border-destructive/30")}>
      <div className="flex items-start gap-3">
        <Thumb url={item.image_url} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{item.name}</span>
            <span className="shrink-0 font-heading text-lg tracking-wide text-sand">{formatDollars(item.price)}</span>
          </span>
          <span className="block text-xs text-muted-foreground">{item.description}</span>
          <span className="mt-1 block text-[0.7rem] text-lavender">
            {CATEGORY_LABEL[item.category]}
            {item.charges !== null ? ` · ${item.charges} ${item.charges === 1 ? "carica" : "cariche"}` : " · non si consuma"}
            {item.effect && ` · altera (resistenza CD ${item.effect.cd})`}
          </span>
          {item.effect && (
            <span className="block text-[0.7rem] text-muted-foreground">
              {item.effect.stages.map((s, i) => `${i + 1}. ${s.name} (${modsText(s.mods)})`).join(" · ")}
            </span>
          )}
        </span>
      </div>
      {canBuy && (
        <div className="flex items-center justify-end gap-2">
          <input
            type="number"
            min={1}
            max={20}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            aria-label="Quantità"
            className="h-8 w-16 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none"
          />
          <Button type="button" size="sm" className="rounded-full" disabled={busy} onClick={() => onBuy(qty)}>
            Compra · {formatDollars(item.price * qty)}
          </Button>
        </div>
      )}
    </li>
  );
}

function Thumb({ url }: { url: string | null }) {
  if (!url)
    return (
      <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-white/5">
        <Package className="size-5 text-muted-foreground" />
      </span>
    );
  // immagine esterna scelta dallo staff
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-12 shrink-0 rounded-lg object-cover" />;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs", active ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}>
      {children}
    </button>
  );
}
function CatButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-full border px-2.5 py-1 text-xs", active ? "border-flamingo bg-flamingo/20" : "border-white/10 hover:bg-white/5")}>
      {children}
    </button>
  );
}
