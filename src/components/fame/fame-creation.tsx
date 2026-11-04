"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Star, X } from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import type { FameCreationState } from "@/lib/fame";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Creazione → Scelte: Fama di background. Si spendono i Punti Fama sulle voci del catalogo
// (o si propone una voce, che approva lo staff); i PF non spesi diventano PX all'approvazione.
// Tutti i controlli li rifà il database (fame_bg_toggle, fame_bg_propose).

export function FameCreation({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [st, setSt] = useState<FameCreationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState("");
  const [propose, setPropose] = useState({ open: false, name: "", description: "" });

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("fame_creation_state", { p_character: characterId });
    if (e) setError(e.message);
    else setSt(data as FameCreationState);
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    if (e) setError(e.message);
    await load();
    return !e;
  }

  if (!st) return error ? <p className="text-sm text-destructive">{error}</p> : <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const left = st.pool - st.spent;
  const chosen = new Set(st.mine.filter((m) => m.item_id).map((m) => m.item_id));
  const categories = [...new Set(st.items.map((i) => i.category))];
  const items = st.items.filter((i) => !cat || i.category === cat);
  const proposals = st.mine.filter((m) => m.custom);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-peach/30 bg-white/5 p-3">
      <h3 className="flex items-center gap-2 font-heading text-xl tracking-wide text-peach">
        <Star className="size-5" /> Fama di background
      </h3>
      <p className="text-sm text-muted-foreground">
        Hai <strong className="text-foreground">{st.pool} Punti Fama</strong> da spendere su quello che il mondo sa già di te. Ti restano{" "}
        <strong className={left > 0 ? "text-mint" : "text-foreground"}>{left} PF</strong>
        {left > 0 && (
          <>
            {" "}
            → all&apos;approvazione diventano <strong className="text-mint">{left * st.rate} PX</strong> ({st.rate} PX per PF)
          </>
        )}
        .
      </p>
      <p className="rounded-lg bg-peach/10 px-3 py-2 text-xs text-peach">
        Attenzione: quando lo staff approva la scheda i PF non spesi diventano PX per sempre, e da lì le voci di fama le cambia solo lo staff.
        {st.max_item > 0 && ` Una voce può costare al massimo ${st.max_item} PF.`}
        {st.max_category > 0 && ` In una stessa categoria puoi spendere al massimo ${st.max_category} PF.`}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {["", ...categories].map((c) => (
            <button
              key={c || "tutte"}
              type="button"
              onClick={() => setCat(c)}
              className={cn("rounded-full px-3 py-1 text-xs", cat === c ? "bg-flamingo/30 text-white" : "bg-white/5 text-muted-foreground hover:bg-white/10")}
            >
              {c || "Tutte"}
            </button>
          ))}
        </div>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => {
          const on = chosen.has(i.id);
          const tooMuch = !on && (i.cost > left || (st.max_item > 0 && i.cost > st.max_item));
          return (
            <li key={i.id}>
              <button
                type="button"
                disabled={busy || (tooMuch && !on)}
                onClick={() => call("fame_bg_toggle", { p_character: characterId, p_item: i.id, p_on: !on })}
                className={cn(
                  "flex h-full w-full items-start gap-2 rounded-xl border p-2.5 text-left text-sm transition-colors",
                  on ? "border-flamingo/60 bg-flamingo/15" : "border-white/10 bg-night/30 hover:bg-white/5",
                  tooMuch && "opacity-50",
                )}
                aria-pressed={on}
              >
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", on ? "border-flamingo bg-flamingo text-white" : "border-white/30")}>
                  {on && <Check className="size-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <strong className="font-medium">{i.name}</strong>
                    <span className="ml-auto shrink-0 text-xs text-peach">{i.cost} PF</span>
                  </span>
                  <span className="block text-[0.7rem] text-lavender">{i.category}</span>
                  {i.description && <span className="block text-xs text-muted-foreground">{i.description}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {proposals.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium">Le tue proposte</p>
          {proposals.map((p) => (
            <p key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
              <strong>{p.name}</strong>
              <span className={cn(p.status === "approvata" ? "text-mint" : p.status === "rifiutata" ? "text-destructive" : "text-peach")}>
                {p.status === "approvata" ? `approvata · ${p.cost} PF` : p.status === "rifiutata" ? "rifiutata" : "in attesa dello staff"}
              </span>
              {p.note && <span className="text-muted-foreground">· {p.note}</span>}
              {p.status === "in_attesa" && (
                <button type="button" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => call("fame_bg_withdraw", { p_character: characterId, p_id: p.id })} aria-label="Ritira la proposta">
                  <X className="size-3.5" />
                </button>
              )}
            </p>
          ))}
        </div>
      )}

      {st.custom &&
        (propose.open ? (
          <div className="flex flex-col gap-2 rounded-xl bg-night/30 p-2.5">
            <input className={inputClass} maxLength={80} placeholder="Nome della voce (es. Ha vinto un talent show in TV)" value={propose.name} onChange={(e) => setPropose({ ...propose, name: e.target.value })} />
            <textarea className={textareaClass} maxLength={500} rows={2} placeholder="Cosa è successo e perché la gente lo sa" value={propose.description} onChange={(e) => setPropose({ ...propose, description: e.target.value })} />
            <p className="text-[0.7rem] text-muted-foreground">Lo staff la guarda e le dà un costo in PF; finché è in attesa non toglie PF. Quelle non decise prima dell&apos;approvazione della scheda non entrano.</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || propose.name.trim().length < 2}
                onClick={async () => {
                  if (await call("fame_bg_propose", { p_character: characterId, p_name: propose.name, p_description: propose.description })) setPropose({ open: false, name: "", description: "" });
                }}
              >
                Invia la proposta
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPropose({ open: false, name: "", description: "" })}>
                Annulla
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setPropose({ ...propose, open: true })}>
            <Plus /> Proponi una voce tua
          </Button>
        ))}
    </section>
  );
}
