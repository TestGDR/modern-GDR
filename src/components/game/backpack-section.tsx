"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Backpack, Eye, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL, type CharacterItem } from "@/lib/market";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Scheda → Zaino. "Con sé": gli oggetti che il personaggio porta dietro, li vedono tutti.
// "Zaino": quello che possiede ma non porta (solo proprietario e staff: lo filtra il database).

type Item = CharacterItem & { carried: boolean };

export function BackpackSection({ characterId, isOwner, canSeeAll }: { characterId: string; isOwner: boolean; canSeeAll: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"con" | "zaino">("con");

  const load = useCallback(async () => {
    const { data } = await supabase.from("character_items").select("*").eq("character_id", characterId).order("category").order("name");
    setItems((data ?? []) as Item[]);
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function move(it: Item, carried: boolean) {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from("character_items").update({ carried }).eq("id", it.id);
    setBusy(false);
    if (e) setError(e.message);
    load();
  }

  if (!items) return null;
  const withMe = items.filter((i) => i.carried);
  const inBag = items.filter((i) => !i.carried);
  const seeBag = isOwner || canSeeAll;

  const current = seeBag ? tab : "con";
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {/* linguette: "Con sé" per tutti, "Zaino" solo per proprietario e staff */}
      <nav className="flex gap-1 self-start rounded-full bg-white/5 p-1" role="tablist" aria-label="Zaino">
        <TabButton active={current === "con"} onClick={() => setTab("con")} icon={Eye} label="Con sé" count={withMe.length} />
        {seeBag && <TabButton active={current === "zaino"} onClick={() => setTab("zaino")} icon={Backpack} label="Zaino" count={inBag.length} />}
      </nav>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {current === "con" ? (
        <section role="tabpanel">
          <p className="mb-2 text-xs text-muted-foreground">Quello che porta dietro e si vede: lo vedono tutti.</p>
          <ItemList items={withMe} empty="Non porta niente con sé." action={isOwner ? { label: "Metti nello zaino", icon: ArrowDownToLine, carried: false } : null} busy={busy} onMove={move} />
        </section>
      ) : (
        <section role="tabpanel">
          <p className="mb-2 text-xs text-muted-foreground">
            Quello che possiede ma non porta dietro{isOwner ? ": lo vedete solo tu e lo staff." : " (lo vede lo staff)."} Gli oggetti si comprano in Utility → Mercato.
          </p>
          <ItemList items={inBag} empty="Lo zaino è vuoto." action={isOwner ? { label: "Porta con sé", icon: ArrowUpFromLine, carried: true } : null} busy={busy} onMove={move} />
        </section>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof Eye; label: string; count: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm", active ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
    >
      <Icon className="size-4" /> {label}
      {count > 0 && <span className="text-xs text-peach">{count}</span>}
    </button>
  );
}

function ItemList({
  items,
  empty,
  action,
  busy,
  onMove,
}: {
  items: Item[];
  empty: string;
  action: { label: string; icon: typeof Eye; carried: boolean } | null;
  busy: boolean;
  onMove: (it: Item, carried: boolean) => void;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-2 @lg:grid-cols-2">
      {items.map((it) => (
        <li key={it.id} className={cn("flex items-center gap-3 rounded-xl border p-2.5", it.carried ? "border-peach/30 bg-peach/5" : "border-white/10 bg-white/5")}>
          {it.image_url ? (
            // immagine scelta dallo staff nel catalogo
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.image_url} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5">
              <Package className="size-4 text-muted-foreground" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{it.name}</span>
            <span className="block text-xs text-muted-foreground">
              {CATEGORY_LABEL[it.category]}
              {it.charges_left !== null && ` · ${it.charges_left} ${it.charges_left === 1 ? "carica" : "cariche"}`}
            </span>
          </span>
          {action && (
            <Button type="button" size="xs" variant="ghost" disabled={busy} className="shrink-0 rounded-full" onClick={() => onMove(it, action.carried)} title={action.label}>
              <action.icon /> <span className="hidden @sm:inline">{action.label}</span>
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
