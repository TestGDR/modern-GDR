"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { formatDollars } from "@/lib/bank";
import type { BusinessType } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Gestione → Attività (permesso attivita.gestire): catalogo delle attività in vendita
// e attività dei personaggi (togliere senza rimborso). CD, rivendita e giorni in Impostazioni.

type Skill = { id: string; name: string };
type Owned = { id: number; name: string; type_name: string; base_income: number; managed_at: string; character: { name: string } | null };

export function BusinessManager() {
  const supabase = useMemo(() => createClient(), []);
  const [types, setTypes] = useState<BusinessType[] | null>(null);
  const [owned, setOwned] = useState<Owned[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [editing, setEditing] = useState<BusinessType | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, o, s] = await Promise.all([
      supabase.from("business_types").select("*").order("sort_order"),
      supabase.from("character_businesses").select("id, name, type_name, base_income, managed_at, character:characters(name)").order("acquired_at", { ascending: false }),
      supabase.from("skills").select("id, name").order("name"),
    ]);
    setTypes((t.data ?? []) as BusinessType[]);
    setOwned((o.data ?? []) as unknown as Owned[]);
    setSkills((s.data ?? []) as Skill[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  if (!types) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const skillName = (id: string | null) => skills.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-xl tracking-wide text-peach">Catalogo</h2>
          <Button type="button" size="sm" className="ml-auto rounded-full" onClick={() => setEditing("new")}>
            <Plus /> Nuova attività
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          La rendita è l&apos;incasso di un mese normale (consigliato circa l&apos;1,5% del prezzo). L&apos;abilità decide il tiro di gestione, con la sua caratteristica.
        </p>
        {editing && (
          <TypeForm
            type={editing === "new" ? null : editing}
            skills={skills}
            onError={setError}
            onDone={() => {
              setEditing(null);
              load();
            }}
          />
        )}
        <ul className="flex flex-col gap-1">
          {types.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setEditing(t)} className={cn("glass flex w-full flex-wrap items-baseline gap-x-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10", !t.active && "opacity-50")}>
                <span className="font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDollars(t.price)} · rendita {formatDollars(t.base_income)} · {skillName(t.skill_id)}
                  {t.max_owners !== null && ` · ${t.max_owners} in vendita`}
                  {!t.active && " · non in vendita"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="font-heading text-xl tracking-wide text-peach">Attività dei personaggi ({owned.length})</h2>
        {owned.length === 0 && <p className="text-sm text-muted-foreground">Nessuno ha ancora un&apos;attività.</p>}
        {owned.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm">
            <span className="font-medium">{o.name}</span>
            <span className="text-xs text-muted-foreground">
              {o.type_name} · {o.character?.name} · rendita {formatDollars(o.base_income)} · ultima gestione {new Date(o.managed_at).toLocaleDateString("it-IT")}
            </span>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="ml-auto"
              aria-label={`Togli ${o.name}`}
              onClick={async () => {
                if (!window.confirm(`Togliere ${o.name} a ${o.character?.name ?? ""}? Non riceve rimborsi.`)) return;
                const { error: e } = await supabase.from("character_businesses").delete().eq("id", o.id);
                if (e) setError(e.message);
                load();
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </section>
    </div>
  );
}

function TypeForm({ type, skills, onDone, onError }: { type: BusinessType | null; skills: Skill[]; onDone: () => void; onError: (e: string | null) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({
    name: type?.name ?? "",
    description: type?.description ?? "",
    image_url: type?.image_url ?? "",
    price: type?.price ?? 10000,
    base_income: type?.base_income ?? 150,
    skill_id: type?.skill_id ?? "",
    max_owners: type?.max_owners ?? null,
    active: type?.active ?? true,
  });

  async function save() {
    onError(null);
    const row = {
      name: f.name.trim(),
      description: f.description.trim(),
      image_url: f.image_url.trim() || null,
      price: Math.max(0, Math.round(f.price)),
      base_income: Math.max(0, Math.round(f.base_income)),
      skill_id: f.skill_id || null,
      max_owners: f.max_owners && f.max_owners > 0 ? Math.round(f.max_owners) : null,
      active: f.active,
    };
    const { error: e } = type ? await supabase.from("business_types").update(row).eq("id", type.id) : await supabase.from("business_types").insert(row);
    if (e) return onError(e.message);
    onDone();
  }
  async function remove() {
    if (!type || !window.confirm(`Eliminare ${type.name} dal catalogo? Chi l'ha già comprata la tiene.`)) return;
    const { error: e } = await supabase.from("business_types").delete().eq("id", type.id);
    if (e) return onError(e.message);
    onDone();
  }

  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={inputClass} value={f.name} maxLength={60} placeholder="Nome" onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select className={inputClass} value={f.skill_id} onChange={(e) => setF({ ...f, skill_id: e.target.value })} aria-label="Abilità di gestione">
          <option value="">Abilità di gestione…</option>
          {skills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          Prezzo $
          <input className={cn(inputClass, "h-8 w-28")} type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-1.5">
          Rendita al mese $
          <input className={cn(inputClass, "h-8 w-24")} type="number" min={0} value={f.base_income} onChange={(e) => setF({ ...f, base_income: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-1.5">
          Quante in vendita
          <input className={cn(inputClass, "h-8 w-20")} type="number" min={0} value={f.max_owners ?? ""} placeholder="∞" onChange={(e) => setF({ ...f, max_owners: e.target.value ? Number(e.target.value) : null })} />
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> In vendita
        </label>
      </div>
      <textarea className={textareaClass} value={f.description} maxLength={1000} placeholder="Descrizione" onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input className={inputClass} value={f.image_url} maxLength={500} placeholder="Immagine (link https, facoltativa)" onChange={(e) => setF({ ...f, image_url: e.target.value })} />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={!f.name.trim()}>
          Salva
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Annulla
        </Button>
        {type && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto text-destructive" onClick={remove}>
            <Trash2 /> Elimina
          </Button>
        )}
      </div>
    </div>
  );
}
