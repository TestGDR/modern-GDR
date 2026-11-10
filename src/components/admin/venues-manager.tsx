"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Plus, Store, Trash2 } from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { formatDollars } from "@/lib/bank";
import type { VenueProduct, VenueRow } from "@/lib/finance";
import { CATEGORY_LABEL, type MarketCategory } from "@/lib/market";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const RichEditor = dynamic(() => import("@/components/guide/rich-editor").then((m) => m.RichEditor), {
  ssr: false,
  loading: () => <Loader2 className="mx-auto animate-spin text-muted-foreground" />,
});

// Gestione → Attività → Locali (attivita.gestire): ogni locale sta in una chat, ha un
// titolare PNG (quelli dei PG sono del proprietario), un lavoro collegato e i prodotti.

type Option = { id: string; name: string };
type EffectSource = { id: string; name: string; effect: unknown };

export function VenuesManager() {
  const supabase = useMemo(() => createClient(), []);
  const [venues, setVenues] = useState<VenueRow[] | null>(null);
  const [rooms, setRooms] = useState<Option[]>([]);
  const [npcs, setNpcs] = useState<Option[]>([]);
  const [jobs, setJobs] = useState<Option[]>([]);
  const [effects, setEffects] = useState<EffectSource[]>([]);
  const [editing, setEditing] = useState<VenueRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [v, r, n, j, e] = await Promise.all([
      supabase.from("venues").select("*").order("business_id", { nullsFirst: true }).order("sort_order").order("name"),
      supabase.from("rooms").select("id, name, access, district:locations(name)").neq("access", "password").order("name"),
      supabase.from("npcs").select("id, name").eq("status", "approvato").order("name"),
      supabase.from("jobs").select("id, name").eq("area", "attivita").order("sort_order"),
      supabase.from("market_items").select("id, name, effect").not("effect", "is", null).order("name"),
    ]);
    setVenues((v.data ?? []) as VenueRow[]);
    setRooms(
      ((r.data ?? []) as unknown as { id: string; name: string; district: { name: string } | null }[]).map((x) => ({
        id: x.id,
        name: x.district ? `${x.district.name} · ${x.name}` : x.name,
      })),
    );
    setNpcs((n.data ?? []) as Option[]);
    setJobs((j.data ?? []) as Option[]);
    setEffects((e.data ?? []) as EffectSource[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  if (!venues) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name ?? "senza chat";

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-xl tracking-wide text-peach">Locali</h2>
        <Button type="button" size="sm" className="ml-auto rounded-full" onClick={() => setEditing("new")}>
          <Plus /> Nuovo locale
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Il locale sta nella chat scelta: lì compare il pulsante «Locale» con descrizione e prodotti. I locali dei personaggi nascono da soli quando comprano un&apos;attività
        (il nome lo decide il proprietario, che scrive anche descrizione e immagine). La parte degli incassi al proprietario è in Impostazioni.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {editing === "new" && (
        <VenueForm
          venue={null}
          rooms={rooms}
          npcs={npcs}
          jobs={jobs}
          effects={effects}
          onError={setError}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      <ul className="flex flex-col gap-1">
        {venues.map((v) => (
          <li key={v.id} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setEditing(editing !== "new" && editing?.id === v.id ? null : v)}
              className={cn("glass flex w-full flex-wrap items-baseline gap-x-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10", !v.active && "opacity-50")}
            >
              <Store className="size-3.5 self-center text-sand" />
              <span className="font-medium">{v.name}</span>
              <span className="text-xs text-muted-foreground">
                {v.business_id ? "di un personaggio" : "della città"}
                {v.category && ` · ${v.category}`} · {roomName(v.room_id)}
                {!v.active && " · nascosto"}
              </span>
            </button>
            {editing !== "new" && editing?.id === v.id && (
              <VenueForm
                venue={v}
                rooms={rooms}
                npcs={npcs}
                jobs={jobs}
                effects={effects}
                onError={setError}
                onDone={() => {
                  setEditing(null);
                  load();
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function VenueForm({
  venue,
  rooms,
  npcs,
  jobs,
  effects,
  onDone,
  onError,
}: {
  venue: VenueRow | null;
  rooms: Option[];
  npcs: Option[];
  jobs: Option[];
  effects: EffectSource[];
  onDone: () => void;
  onError: (e: string | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const ofPlayer = !!venue?.business_id;
  const [f, setF] = useState({
    name: venue?.name ?? "",
    category: venue?.category ?? "",
    room_id: venue?.room_id ?? "",
    owner_npc_id: venue?.owner_npc_id ?? "",
    job_id: venue?.job_id ?? "",
    description: venue?.description ?? "",
    image_url: venue?.image_url ?? "",
    active: venue?.active ?? true,
    sort_order: venue?.sort_order ?? 0,
  });

  async function save() {
    onError(null);
    const row = {
      category: f.category.trim(),
      room_id: f.room_id || null,
      job_id: ofPlayer ? null : f.job_id || null,
      owner_npc_id: ofPlayer ? null : f.owner_npc_id || null,
      description: f.description,
      image_url: f.image_url.trim() || null,
      active: f.active,
      sort_order: Math.round(f.sort_order) || 0,
      ...(ofPlayer ? {} : { name: f.name.trim() }),
    };
    const { error: e } = venue ? await supabase.from("venues").update(row).eq("id", venue.id) : await supabase.from("venues").insert(row);
    if (e) return onError(e.message.includes("venues_room_id_key") ? "In quella chat c'è già un altro locale." : e.message);
    onDone();
  }
  async function remove() {
    if (!venue || !window.confirm(`Eliminare il locale ${venue.name} con i suoi prodotti? Chi li ha già comprati li tiene.`)) return;
    const { error: e } = await supabase.from("venues").delete().eq("id", venue.id);
    if (e) return onError(e.message);
    onDone();
  }

  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className={inputClass}
          value={f.name}
          maxLength={60}
          disabled={ofPlayer}
          title={ofPlayer ? "Il nome lo sceglie il proprietario" : undefined}
          placeholder="Nome"
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <input className={inputClass} value={f.category} maxLength={40} placeholder="Tipo (Bar, Ristorante, Negozio…)" onChange={(e) => setF({ ...f, category: e.target.value })} />
        <select className={inputClass} value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })} aria-label="Chat">
          <option value="">In quale chat si trova…</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {!ofPlayer && (
          <select className={inputClass} value={f.owner_npc_id} onChange={(e) => setF({ ...f, owner_npc_id: e.target.value })} aria-label="Titolare PNG">
            <option value="">Titolare PNG (facoltativo)…</option>
            {npcs.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        )}
        {!ofPlayer && (
          <select className={inputClass} value={f.job_id} onChange={(e) => setF({ ...f, job_id: e.target.value })} aria-label="Lavoro collegato">
            <option value="">Lavoro collegato (Locali e attività)…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        )}
        <input className={inputClass} value={f.image_url} maxLength={500} placeholder="Immagine (link https, facoltativa)" onChange={(e) => setF({ ...f, image_url: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Visibile
        </label>
        <label className="flex items-center gap-1.5">
          Ordine
          <input className={cn(inputClass, "h-8 w-20")} type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} />
        </label>
      </div>
      <RichEditor value={f.description} onChange={(html) => setF((x) => ({ ...x, description: html }))} minHeight="min-h-40" />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={!ofPlayer && f.name.trim().length < 2}>
          Salva
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Annulla
        </Button>
        {venue && !ofPlayer && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto text-destructive" onClick={remove}>
            <Trash2 /> Elimina
          </Button>
        )}
      </div>
      {venue ? <ProductsEditor venueId={venue.id} effects={effects} onError={onError} /> : <p className="text-xs text-muted-foreground">I prodotti si aggiungono dopo aver salvato il locale.</p>}
    </div>
  );
}

const CATEGORIES = Object.keys(CATEGORY_LABEL) as MarketCategory[];

function ProductsEditor({ venueId, effects, onError }: { venueId: string; effects: EffectSource[]; onError: (e: string | null) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<VenueProduct[] | null>(null);
  const [editing, setEditing] = useState<VenueProduct | "new" | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("venue_products").select("*").eq("venue_id", venueId).order("sort_order").order("name");
    setRows((data ?? []) as VenueProduct[]);
  }, [supabase, venueId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  if (!rows) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const done = () => {
    setEditing(null);
    load();
  };
  return (
    <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
      <div className="flex items-center gap-2">
        <p className="text-xs tracking-wider text-peach uppercase">Prodotti ({rows.length})</p>
        <Button type="button" size="xs" variant="outline" className="ml-auto rounded-full" onClick={() => setEditing("new")}>
          <Plus /> Prodotto
        </Button>
      </div>
      {editing === "new" && <ProductForm venueId={venueId} product={null} effects={effects} onError={onError} onDone={done} />}
      {rows.map((p) => (
        <div key={p.id} className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setEditing(editing !== "new" && editing?.id === p.id ? null : p)}
            className={cn("flex flex-wrap items-baseline gap-x-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-left text-sm hover:bg-white/10", !p.active && "opacity-50")}
          >
            <span className="font-medium">{p.name}</span>
            <span className="text-xs text-muted-foreground">
              {formatDollars(p.price)} · {CATEGORY_LABEL[p.category as MarketCategory] ?? p.category}
              {p.charges !== null && ` · ${p.charges} usi`}
              {p.effect !== null && " · con effetto"}
              {!p.active && " · nascosto"}
            </span>
          </button>
          {editing !== "new" && editing?.id === p.id && <ProductForm venueId={venueId} product={p} effects={effects} onError={onError} onDone={done} />}
        </div>
      ))}
    </div>
  );
}

function ProductForm({
  venueId,
  product,
  effects,
  onDone,
  onError,
}: {
  venueId: string;
  product: VenueProduct | null;
  effects: EffectSource[];
  onDone: () => void;
  onError: (e: string | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    category: (product?.category ?? "cibo") as MarketCategory,
    price: product?.price ?? 10,
    charges: product ? product.charges : 1,
    use_text: product?.use_text ?? "usa",
    image_url: product?.image_url ?? "",
    active: product?.active ?? true,
    sort_order: product?.sort_order ?? 0,
  });
  // effetto: "" = nessuno, "keep" = quello che ha già, altrimenti copiato da un oggetto del mercato
  const [effect, setEffect] = useState(product?.effect ? "keep" : "");

  async function save() {
    onError(null);
    const row: Record<string, unknown> = {
      venue_id: venueId,
      name: f.name.trim(),
      description: f.description.trim(),
      category: f.category,
      price: Math.max(0, Math.round(f.price)),
      charges: f.charges && f.charges > 0 ? Math.round(f.charges) : null,
      use_text: f.use_text.trim() || "usa",
      image_url: f.image_url.trim() || null,
      active: f.active,
      sort_order: Math.round(f.sort_order) || 0,
    };
    if (effect !== "keep") row.effect = effect ? (effects.find((x) => x.id === effect)?.effect ?? null) : null;
    const { error: e } = product ? await supabase.from("venue_products").update(row).eq("id", product.id) : await supabase.from("venue_products").insert(row);
    if (e) return onError(e.message);
    onDone();
  }
  async function remove() {
    if (!product || !window.confirm(`Eliminare ${product.name}? Chi l'ha già comprato lo tiene.`)) return;
    const { error: e } = await supabase.from("venue_products").delete().eq("id", product.id);
    if (e) return onError(e.message);
    onDone();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-night/40 p-2.5 text-xs">
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={inputClass} value={f.name} maxLength={60} placeholder="Nome" onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select className={inputClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as MarketCategory })} aria-label="Categoria">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <input className={inputClass} value={f.use_text} maxLength={40} placeholder="Come si usa in chat (beve, mangia…)" onChange={(e) => setF({ ...f, use_text: e.target.value })} />
        <select className={inputClass} value={effect} onChange={(e) => setEffect(e.target.value)} aria-label="Effetto">
          <option value="">Nessun effetto</option>
          {product?.effect ? <option value="keep">Tieni l&apos;effetto attuale</option> : null}
          {effects.map((x) => (
            <option key={x.id} value={x.id}>
              Effetto come «{x.name}»
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1.5">
          Prezzo $
          <input className={cn(inputClass, "h-8 w-24")} type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-1.5">
          Usi
          <input
            className={cn(inputClass, "h-8 w-20")}
            type="number"
            min={0}
            max={100}
            value={f.charges ?? ""}
            placeholder="resta"
            onChange={(e) => setF({ ...f, charges: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label className="flex items-center gap-1.5">
          Ordine
          <input className={cn(inputClass, "h-8 w-16")} type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> In vendita
        </label>
      </div>
      <textarea className={textareaClass} value={f.description} maxLength={500} placeholder="Descrizione breve" onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input className={inputClass} value={f.image_url} maxLength={500} placeholder="Immagine (link https, facoltativa)" onChange={(e) => setF({ ...f, image_url: e.target.value })} />
      <p className="text-[0.7rem] text-muted-foreground">Usi vuoto = oggetto che resta (non si consuma). Con un effetto, usarlo in chat fa il tiro di resistenza di alcol o droghe.</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={f.name.trim().length < 2}>
          Salva
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Annulla
        </Button>
        {product && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto text-destructive" onClick={remove}>
            <Trash2 /> Elimina
          </Button>
        )}
      </div>
    </div>
  );
}
