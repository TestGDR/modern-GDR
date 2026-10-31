"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gift, Loader2, Plus, Trash2 } from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { formatDollars } from "@/lib/bank";
import { ATTRIBUTE_CODES, CATEGORY_LABEL, modsText, type AlterationStage, type ItemEffect, type MarketCategory, type MarketItem } from "@/lib/market";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Gestione → Mercato (permesso mercato.gestire): catalogo, mercato nero,
// effetti di alcol e droghe (3 stadi + postumi), regali ai personaggi.

const emptyStage = (n: number): AlterationStage => ({ name: `Stadio ${n}`, hours: n + 1, mods: { RIF: -n }, text: "" });
const defaultEffect = (): ItemEffect => ({ type: "alcol", cd: 12, stages: [emptyStage(1), emptyStage(2), emptyStage(3)], aftermath: { name: "Postumi", hours: 6, mods: { INT: -1 }, text: "" } });

export function MarketManager() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<MarketItem[] | null>(null);
  const [editing, setEditing] = useState<MarketItem | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("market_items").select("*").order("black_market").order("category").order("sort_order");
    setItems((data ?? []) as MarketItem[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  if (!items) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="rounded-full" onClick={() => setEditing("new")}>
          <Plus /> Nuovo oggetto
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Il mercato nero lo vedono solo i personaggi dei gruppi con il tag «malavita» (Gestione → Gruppi). Alcol e droghe: a ogni uso in chat tiro di resistenza VIG + Resistenza fisica + d10 contro la CD (+2 per ogni stadio già raggiunto); se fallisce si sale di uno stadio, fino a 3, poi i postumi.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {editing && (
        <ItemForm
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? null : editing}
          onDone={() => {
            setEditing(null);
            load();
          }}
          onError={setError}
        />
      )}
      <ul className="flex flex-col gap-1">
        {items.map((it) => (
          <li key={it.id} className={cn("flex flex-wrap items-baseline gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm", !it.active && "opacity-50")}>
            <button type="button" className="font-medium hover:underline" onClick={() => setEditing(it)}>
              {it.name}
            </button>
            <span className="text-xs text-muted-foreground">
              {CATEGORY_LABEL[it.category]} · {formatDollars(it.price)}
              {it.charges !== null ? ` · ${it.charges} cariche` : ""}
              {it.effect ? ` · ${it.effect.type} CD ${it.effect.cd}` : ""}
              {it.black_market && " · mercato nero"}
              {!it.active && " · nascosto"}
            </span>
          </li>
        ))}
      </ul>
      <GiftBox items={items} onError={setError} />
    </div>
  );
}

function ItemForm({ item, onDone, onError }: { item: MarketItem | null; onDone: () => void; onError: (e: string | null) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({
    name: item?.name ?? "",
    description: item?.description ?? "",
    category: item?.category ?? ("altro" as MarketCategory),
    price: item?.price ?? 0,
    image_url: item?.image_url ?? "",
    black_market: item?.black_market ?? false,
    consumable: item ? item.charges !== null : false,
    charges: item?.charges ?? 1,
    use_text: item?.use_text ?? "usa",
    active: item?.active ?? true,
  });
  const [effect, setEffect] = useState<ItemEffect | null>(item?.effect ?? null);

  const setStage = (i: number, patch: Partial<AlterationStage>) =>
    effect && setEffect({ ...effect, stages: effect.stages.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  async function save() {
    onError(null);
    const row = {
      name: f.name.trim(),
      description: f.description.trim(),
      category: f.category,
      price: Math.max(0, Math.round(f.price)),
      image_url: f.image_url.trim() || null,
      black_market: f.black_market,
      charges: f.consumable ? Math.max(1, Math.min(100, Math.round(f.charges))) : null,
      use_text: f.use_text.trim() || "usa",
      effect: f.consumable ? effect : null,
      active: f.active,
    };
    const { error: e } = item ? await supabase.from("market_items").update(row).eq("id", item.id) : await supabase.from("market_items").insert(row);
    if (e) return onError(e.message);
    onDone();
  }
  async function remove() {
    if (!item || !window.confirm(`Eliminare ${item.name} dal catalogo? Chi l'ha già comprato lo tiene.`)) return;
    const { error: e } = await supabase.from("market_items").delete().eq("id", item.id);
    if (e) return onError(e.message);
    onDone();
  }

  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-4">
        <input className={cn(inputClass, "sm:col-span-2")} value={f.name} maxLength={60} placeholder="Nome" onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select className={inputClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as MarketCategory })}>
          {(Object.keys(CATEGORY_LABEL) as MarketCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs">
          Prezzo $
          <input className={inputClass} type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
        </label>
      </div>
      <textarea className={textareaClass} value={f.description} maxLength={1000} placeholder="Descrizione" onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input className={inputClass} value={f.image_url} maxLength={500} placeholder="Immagine (link https, facoltativa)" onChange={(e) => setF({ ...f, image_url: e.target.value })} />
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.black_market} onChange={(e) => setF({ ...f, black_market: e.target.checked })} /> Mercato nero
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> In vendita
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.consumable} onChange={(e) => setF({ ...f, consumable: e.target.checked })} /> Consumabile
        </label>
        {f.consumable && (
          <>
            <label className="flex items-center gap-1.5">
              Cariche
              <input className={cn(inputClass, "h-8 w-16")} type="number" min={1} max={100} value={f.charges} onChange={(e) => setF({ ...f, charges: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-1.5">
              In chat: «Nome
              <input className={cn(inputClass, "h-8 w-40")} value={f.use_text} maxLength={40} placeholder="beve un sorso di" onChange={(e) => setF({ ...f, use_text: e.target.value })} />
              {f.name || "oggetto"}»
            </label>
          </>
        )}
      </div>

      {f.consumable && (
        <section className="flex flex-col gap-2 rounded-xl bg-white/5 p-2.5">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!effect} onChange={(e) => setEffect(e.target.checked ? (item?.effect ?? defaultEffect()) : null)} />
            Altera il personaggio (alcol o droga)
          </label>
          {effect && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <select className={cn(inputClass, "h-8 w-28")} value={effect.type} onChange={(e) => setEffect({ ...effect, type: e.target.value as ItemEffect["type"] })}>
                  <option value="alcol">Alcol</option>
                  <option value="droga">Droga</option>
                </select>
                <label className="flex items-center gap-1.5">
                  CD resistenza
                  <input className={cn(inputClass, "h-8 w-16")} type="number" min={1} max={30} value={effect.cd} onChange={(e) => setEffect({ ...effect, cd: Number(e.target.value) })} />
                </label>
              </div>
              {effect.stages.map((s, i) => (
                <StageEditor key={i} title={`Stadio ${i + 1}`} stage={s} onChange={(p) => setStage(i, p)} />
              ))}
              <StageEditor
                title="Postumi (dopo l'ultimo stadio raggiunto)"
                stage={effect.aftermath ?? { name: "Postumi", hours: 0, mods: {}, text: "" }}
                onChange={(p) => setEffect({ ...effect, aftermath: { ...(effect.aftermath ?? { name: "Postumi", hours: 0, mods: {}, text: "" }), ...p } })}
              />
            </>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={f.name.trim().length < 2} onClick={save}>
          Salva
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Chiudi
        </Button>
        {item && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto text-destructive" onClick={remove}>
            <Trash2 /> Elimina
          </Button>
        )}
      </div>
    </div>
  );
}

function StageEditor({ title, stage, onChange }: { title: string; stage: AlterationStage; onChange: (p: Partial<AlterationStage>) => void }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 p-2 text-xs">
      <p className="font-medium text-peach">
        {title} <span className="font-normal text-muted-foreground">{modsText(stage.mods)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(inputClass, "h-8 w-40")} value={stage.name} maxLength={40} placeholder="Nome (es. Brillo/a)" onChange={(e) => onChange({ name: e.target.value })} />
        <label className="flex items-center gap-1">
          Ore
          <input className={cn(inputClass, "h-8 w-16")} type="number" min={0} max={72} step={0.5} value={stage.hours} onChange={(e) => onChange({ hours: Number(e.target.value) })} />
        </label>
        {ATTRIBUTE_CODES.map((code) => (
          <label key={code} className="flex items-center gap-1">
            {code}
            <input
              className={cn(inputClass, "h-8 w-14")}
              type="number"
              min={-5}
              max={0}
              value={stage.mods[code] ?? 0}
              onChange={(e) => {
                const v = Math.max(-5, Math.min(0, Number(e.target.value)));
                const mods = { ...stage.mods };
                if (v === 0) delete mods[code];
                else mods[code] = v;
                onChange({ mods });
              }}
            />
          </label>
        ))}
      </div>
      <input className={inputClass} value={stage.text} maxLength={200} placeholder="Come si comporta il personaggio (compare in scheda)" onChange={(e) => onChange({ text: e.target.value })} />
    </div>
  );
}

/** Regalo di un oggetto del catalogo a un personaggio approvato */
function GiftBox({ items, onError }: { items: MarketItem[]; onError: (e: string | null) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ character: "", item: "", qty: 1 });
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase
      .from("characters")
      .select("id, name")
      .eq("status", "approvata")
      .order("name")
      .then(({ data }) => alive && setCharacters((data ?? []) as { id: string; name: string }[]));
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function give() {
    onError(null);
    setDone(null);
    const { error: e } = await supabase.rpc("market_give", { p_character: f.character, p_item: f.item, p_qty: f.qty });
    if (e) return onError(e.message);
    setDone("Regalato.");
  }

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
      <h3 className="flex items-center gap-1.5 font-heading text-lg tracking-wide text-peach">
        <Gift className="size-4" /> Regala un oggetto
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <select className={cn(inputClass, "w-52")} value={f.character} onChange={(e) => setF({ ...f, character: e.target.value })}>
          <option value="">Personaggio…</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className={cn(inputClass, "w-52")} value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
          <option value="">Oggetto…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <input className={cn(inputClass, "w-16")} type="number" min={1} max={20} value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} />
        <Button type="button" size="sm" disabled={!f.character || !f.item} onClick={give}>
          Regala
        </Button>
        {done && <span className="text-xs text-mint">{done}</span>}
      </div>
    </section>
  );
}
