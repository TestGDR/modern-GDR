"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronDown, Loader2, MapPin, Pencil, Search, ShoppingBag, Store, UserRound } from "lucide-react";
import { inputClass } from "@/components/admin/admin-ui";
import { SafeHtml } from "@/components/guide/safe-html";
import { Button } from "@/components/ui/button";
import { formatDollars } from "@/lib/bank";
import type { VenueCard, VenueDetail, VenueItem } from "@/lib/finance";
import { CATEGORY_LABEL, type MarketCategory } from "@/lib/market";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const RichEditor = dynamic(() => import("@/components/guide/rich-editor").then((m) => m.RichEditor), {
  ssr: false,
  loading: () => <Loader2 className="mx-auto animate-spin text-muted-foreground" />,
});

// Locali (di PNG e di PG): descrizione e prodotti. In chat si compra
// (venue_buy: l'oggetto va negli Oggetti, in chat «ordina …»); in Utility → Attività
// c'è l'elenco completo. Regole e controlli nel database.

/** Chi possiede il locale */
function Owner({ v }: { v: VenueCard }) {
  if (!v.owner_name) return <span className="text-muted-foreground">{v.kind === "pg" ? "Personaggio" : "Della città"}</span>;
  if (v.owner_character_id)
    return (
      <Link href={`/scheda/${v.owner_character_id}`} className="hover:underline">
        {v.owner_name}
      </Link>
    );
  return <span>{v.owner_name}</span>;
}

/** Dettaglio di un locale: descrizione e prodotti; con roomId e un personaggio si compra */
export function VenueView({
  venueId,
  roomId,
  characterId,
  joined = false,
  compact = false,
}: {
  venueId: string;
  roomId?: string;
  characterId?: string | null;
  joined?: boolean;
  compact?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [v, setV] = useState<VenueDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("venue_get", { p_venue: venueId });
    if (data) setV(data as VenueDetail);
    else setMissing(true);
  }, [supabase, venueId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function buy(item: VenueItem, qty: number) {
    if (!roomId || !characterId || busy) return;
    if (!window.confirm(`Prendere ${qty > 1 ? `${qty} × ` : ""}${item.name} per ${formatDollars(item.price * qty)}?`)) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: e } = await supabase.rpc("venue_buy", { p_character: characterId, p_product: item.id, p_room: roomId, p_qty: qty });
    setBusy(false);
    if (e) return setError(e.message);
    setInfo(`${item.name}: fatto! Lo trovi nei tuoi Oggetti.`);
  }

  if (missing) return <p className="text-sm text-muted-foreground">Locale non trovato.</p>;
  if (!v) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const canBuy = !!roomId && !!characterId;

  return (
    <div className="flex flex-col gap-3 text-sm">
      {v.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- immagini esterne dei locali
        <img src={v.image_url} alt="" className={cn("w-full rounded-xl object-cover", compact ? "max-h-36" : "max-h-56")} />
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-heading text-2xl tracking-wide text-sand">{v.name}</h3>
        {v.category && <span className="text-xs text-lavender">{v.category}</span>}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <UserRound className="size-3.5 text-peach" /> Titolare: <Owner v={v} />
        </span>
        {v.room_id && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5 text-peach" />
            {roomId ? (
              <>{v.district ? `${v.district} · ` : ""}{v.room_name}</>
            ) : (
              <Link href={`/chat/${v.room_id}`} className="hover:underline">
                {v.district ? `${v.district} · ` : ""}
                {v.room_name}
              </Link>
            )}
          </span>
        )}
        {v.job_id && v.job_name && (
          <Link href={`/utility/lavori?apri=${v.job_id}`} className="text-muted-foreground hover:underline">
            Lavorare qui
          </Link>
        )}
      </p>

      {editing ? (
        <InfoEditor
          venue={v}
          onDone={(saved) => {
            setEditing(false);
            if (saved) load();
          }}
        />
      ) : (
        <>
          {v.description ? (
            <SafeHtml html={v.description} className="guide-content text-sm" />
          ) : (
            <p className="text-xs text-muted-foreground">Nessuna descrizione.</p>
          )}
          {v.can_edit && (
            <Button type="button" size="xs" variant="outline" className="self-start rounded-full" onClick={() => setEditing(true)}>
              <Pencil /> Modifica descrizione e immagine
            </Button>
          )}
        </>
      )}

      <section className="flex flex-col gap-1.5">
        <h4 className="flex items-center gap-1.5 text-xs tracking-wider text-peach uppercase">
          <ShoppingBag className="size-3.5" /> Cosa offre
        </h4>
        {v.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Per ora niente in vendita.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {v.items.map((it) => (
              <ProductRow key={it.id} item={it} canBuy={canBuy} joined={joined} busy={busy} onBuy={(q) => buy(it, q)} />
            ))}
          </ul>
        )}
        {error && <p className="rounded-lg bg-destructive/15 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
        {info && <p className="rounded-lg bg-mint/15 px-2.5 py-1.5 text-xs text-mint">{info}</p>}
        <p className="text-[0.7rem] text-muted-foreground">
          {canBuy
            ? "Si paga dal conto; quello che prendi finisce nei tuoi Oggetti (si usa dal pulsante Oggetti) e in chat si legge cosa hai ordinato."
            : "Si ordina in chat, dal pulsante «Locale», mentre sei in giocata lì."}
        </p>
      </section>
    </div>
  );
}

function ProductRow({ item, canBuy, joined, busy, onBuy }: { item: VenueItem; canBuy: boolean; joined: boolean; busy: boolean; onBuy: (qty: number) => void }) {
  const [qty, setQty] = useState(1);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-night/40 px-3 py-2">
      {item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- immagini esterne dei locali
        <img src={item.image_url} alt="" className="size-9 shrink-0 rounded-md object-cover" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{item.name}</span>
        {item.description && <span className="block text-xs text-muted-foreground">{item.description}</span>}
        <span className="block text-[0.7rem] text-lavender">
          {CATEGORY_LABEL[item.category as MarketCategory] ?? item.category}
          {item.charges !== null && ` · ${item.charges} ${item.charges === 1 ? "uso" : "usi"}`}
          {item.effect === "alcol" && " · alcolico"}
          {item.effect === "droga" && " · sostanza"}
        </span>
      </span>
      <span className="shrink-0 font-heading text-lg tracking-wide text-sand">{formatDollars(item.price)}</span>
      {canBuy && (
        <span className="flex items-center gap-1">
          <select
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            aria-label="Quantità"
            className="h-7 rounded-lg border border-input bg-night/40 px-1 text-xs outline-none"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                ×{n}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" className="rounded-full" disabled={busy || !joined} title={joined ? undefined : "Entra in giocata per ordinare"} onClick={() => onBuy(qty)}>
            Prendi
          </Button>
        </span>
      )}
    </li>
  );
}

/** Descrizione e immagine: staff o proprietario del locale */
function InfoEditor({ venue, onDone }: { venue: VenueDetail; onDone: (saved: boolean) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [description, setDescription] = useState(venue.description);
  const [image, setImage] = useState(venue.image_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc("venue_set_info", { p_venue: venue.id, p_description: description, p_image_url: image.trim() || null });
    setBusy(false);
    if (e) return setError(e.message);
    onDone(true);
  }
  return (
    <div className="flex flex-col gap-2">
      <RichEditor value={description} onChange={setDescription} minHeight="min-h-40" />
      <input className={inputClass} value={image} maxLength={500} placeholder="Immagine (link https, facoltativa)" onChange={(e) => setImage(e.target.value)} />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={save}>
          Salva
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDone(false)}>
          Annulla
        </Button>
      </div>
    </div>
  );
}

/** Utility → Attività: tutti i locali della città e dei personaggi */
export function VenuesDirectory() {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<VenueCard[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    supabase.rpc("venues_list").then(({ data }) => setList((data ?? []) as VenueCard[]));
  }, [supabase]);

  if (!list) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const needle = q.trim().toLowerCase();
  const shown = list.filter((v) => !needle || [v.name, v.category, v.owner_name, v.district, v.room_name].some((s) => s?.toLowerCase().includes(needle)));
  const groups: { title: string; rows: VenueCard[] }[] = [
    { title: "Della città", rows: shown.filter((v) => v.kind === "png") },
    { title: "Dei personaggi", rows: shown.filter((v) => v.kind === "pg") },
  ];

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-xl tracking-wide text-peach">Locali e attività della città</h2>
      <label className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input className={cn(inputClass, "pl-8")} value={q} placeholder="Cerca per nome, tipo, titolare o quartiere" onChange={(e) => setQ(e.target.value)} />
      </label>
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-1">
          <h3 className="text-xs tracking-wider text-lavender uppercase">
            {g.title} ({g.rows.length})
          </h3>
          {g.rows.length === 0 && <p className="text-xs text-muted-foreground">Nessuno.</p>}
          <ul className="flex flex-col gap-1">
            {g.rows.map((v) => (
              <li key={v.id} className="glass rounded-xl">
                <button
                  type="button"
                  onClick={() => setOpen(open === v.id ? null : v.id)}
                  aria-expanded={open === v.id}
                  className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-left text-sm hover:bg-white/5"
                >
                  <Store className="size-4 shrink-0 text-sand" />
                  <span className="font-medium">{v.name}</span>
                  {v.category && <span className="text-xs text-lavender">{v.category}</span>}
                  <span className="text-xs text-muted-foreground">
                    {v.owner_name ? `· ${v.owner_name}` : ""}
                    {v.room_name ? ` · ${v.district ? `${v.district}, ` : ""}${v.room_name}` : " · senza chat"}
                  </span>
                  <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open === v.id && "rotate-180")} />
                </button>
                {open === v.id && (
                  <div className="border-t border-white/10 p-3">
                    <VenueView venueId={v.id} compact />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
