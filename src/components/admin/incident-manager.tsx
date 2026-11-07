"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIER_LABEL, diceText, type IncidentTier, type IncidentType } from "@/components/game/incident-panel";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Gestione → Incidenti (permesso combattimento.gestire): l'elenco del pannello «Incidente» della chat.

const TIERS: IncidentTier[] = ["lieve", "normale", "medio", "grave"];
const inputCls = "h-8 rounded-lg border border-white/15 bg-night/40 px-2 text-sm";
type Draft = Omit<IncidentType, "id"> & { id?: string };

const empty = (): Draft => ({ name: "", tier: "normale", dice_count: 1, dice_sides: 6, bonus: 0, cd: 12, description: "", sort_order: 100, active: true });

function Row({ value, onSaved }: { value: Draft; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<Draft>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = !d.id;
  const num = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Number(e.target.value) });

  async function save() {
    setBusy(true);
    setError(null);
    const row = { name: d.name.trim(), tier: d.tier, dice_count: d.dice_count, dice_sides: d.dice_sides, bonus: d.bonus, cd: d.cd, description: d.description.trim(), sort_order: d.sort_order, active: d.active };
    const { error: e } = isNew ? await supabase.from("incident_types").insert(row) : await supabase.from("incident_types").update(row).eq("id", d.id!);
    setBusy(false);
    if (e) return setError(e.code === "23505" ? "Esiste già un incidente con questo nome." : "Salvataggio non riuscito: controlla i numeri.");
    if (isNew) setD(empty());
    onSaved();
  }
  async function remove() {
    if (!d.id || !window.confirm(`Eliminare «${d.name}»?`)) return;
    setBusy(true);
    await supabase.from("incident_types").delete().eq("id", d.id);
    setBusy(false);
    onSaved();
  }

  return (
    <li className={cn("flex flex-col gap-2 rounded-xl border p-2.5", isNew ? "border-peach/40 bg-peach/10" : "border-white/10 bg-white/5", !d.active && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(inputCls, "min-w-40 flex-1")} value={d.name} maxLength={60} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Nome (es. Caduta dal surf)" aria-label="Nome" />
        <select className={inputCls} value={d.tier} onChange={(e) => setD({ ...d, tier: e.target.value as IncidentTier })} aria-label="Gravità">
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Dadi
          <input className={cn(inputCls, "w-12")} type="number" min={1} max={6} value={d.dice_count} onChange={num("dice_count")} aria-label="Numero di dadi" />d
          <input className={cn(inputCls, "w-14")} type="number" min={2} max={20} value={d.dice_sides} onChange={num("dice_sides")} aria-label="Facce" />+
          <input className={cn(inputCls, "w-12")} type="number" min={0} max={30} value={d.bonus} onChange={num("bonus")} aria-label="Bonus" />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          CD
          <input className={cn(inputCls, "w-14")} type="number" min={5} max={30} value={d.cd} onChange={num("cd")} aria-label="Difficoltà" />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Ordine
          <input className={cn(inputCls, "w-16")} type="number" value={d.sort_order} onChange={num("sort_order")} aria-label="Ordine" />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Attivo
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(inputCls, "min-w-0 flex-1")} value={d.description} maxLength={300} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Esempi (si leggono passando sopra al nome)" aria-label="Descrizione" />
        <span className="text-xs text-muted-foreground">danno {diceText(d)}</span>
        <Button type="button" size="xs" disabled={busy || d.name.trim().length < 2} onClick={save} className="rounded-full">
          {isNew ? <Plus /> : <Save />} {isNew ? "Aggiungi" : "Salva"}
        </Button>
        {!isNew && (
          <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={remove} className="rounded-full text-destructive" aria-label="Elimina">
            <Trash2 />
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

export function IncidentManager() {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<IncidentType[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("incident_types").select("*").order("sort_order").order("name");
    setList((data ?? []) as IncidentType[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Danno = i dadi dell&apos;incidente. Chi lo subisce tira Vigore + Resistenza fisica + d10 contro la CD: se riesce dimezza il danno, con 10 non si fa niente, con 1 il danno
        è pieno e la ferita peggiora di un grado. Ferita da 4 PF (lieve), 9 (moderata), 16 (grave); gli incidenti lievi danno al massimo una ferita lieve, la molto grave solo quelli
        gravi. Ferita grave o molto grave: gare saltate in squadra (Impostazioni del sistema, «Incidenti») e avviso allo staff.
      </p>
      <ul className="flex flex-col gap-2">
        <Row key="nuovo" value={empty()} onSaved={load} />
        {(list ?? []).map((t) => (
          <Row key={`${t.id}-${t.name}-${t.tier}-${t.dice_count}-${t.dice_sides}-${t.bonus}-${t.cd}-${t.active}-${t.sort_order}`} value={t} onSaved={load} />
        ))}
      </ul>
    </div>
  );
}
