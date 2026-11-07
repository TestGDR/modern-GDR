"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Assegna PX (permesso personaggi.assegnare_px): PX dati o tolti a uno o più personaggi
// approvati con il motivo; ogni assegnazione resta nel registro e avvisa il giocatore.

export type XpGrant = {
  id: number;
  character_id: string;
  character_name: string;
  amount: number;
  reason: string;
  created_at: string;
  granted_by_name: string;
};

const inputCls = "h-9 rounded-lg border border-white/15 bg-night/40 px-3 text-sm";

/** Modulo: PX (anche negativi) e motivo, per i personaggi scelti */
export function XpGrantForm({ characterIds, onDone, compact = false }: { characterIds: string[]; onDone: () => void; compact?: boolean }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isInteger(n) || n === 0) return setMsg({ ok: false, text: "Scrivi un numero intero di PX (anche negativo), non zero." });
    if (reason.trim().length < 3) return setMsg({ ok: false, text: "Scrivi il motivo." });
    if (characterIds.length === 0) return setMsg({ ok: false, text: "Scegli almeno un personaggio." });
    if (!window.confirm(`${n > 0 ? "Dare" : "Togliere"} ${Math.abs(n)} PX a ${characterIds.length === 1 ? "questo personaggio" : `${characterIds.length} personaggi`}?`)) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await createClient().rpc("xp_grant", { p_characters: characterIds, p_amount: n, p_reason: reason.trim() });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `Fatto: ${n > 0 ? "dati" : "tolti"} ${Math.abs(n)} PX a ${data} ${data === 1 ? "personaggio" : "personaggi"}.` });
    setAmount("");
    setReason("");
    onDone();
  }

  return (
    <form onSubmit={submit} className={cn("flex flex-col gap-2", !compact && "rounded-2xl border border-white/10 bg-white/5 p-3")}>
      <div className="flex flex-wrap gap-2">
        <input
          className={cn(inputCls, "w-28")}
          type="number"
          step={1}
          min={-10000}
          max={10000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="PX (es. 50)"
          aria-label="PX da assegnare"
        />
        <input
          className={cn(inputCls, "min-w-0 flex-1")}
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (es. premio per la quest «La festa del faro»)"
          aria-label="Motivo"
        />
        <Button type="submit" disabled={busy} className="rounded-full">
          <Star /> {busy ? "Assegno…" : "Assegna PX"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Un numero negativo toglie PX (mai sotto zero). Il giocatore riceve un messaggio di SISTEMA con il motivo.</p>
      {msg && <p className={cn("text-xs", msg.ok ? "text-mint" : "text-destructive")}>{msg.text}</p>}
    </form>
  );
}

/** Elenco delle assegnazioni */
export function XpGrantLog({ grants, showName = true }: { grants: XpGrant[]; showName?: boolean }) {
  if (grants.length === 0) return <p className="text-xs text-muted-foreground">Nessuna assegnazione.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {grants.map((g) => (
        <li key={g.id} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs">
          <strong className={g.amount > 0 ? "text-mint" : "text-destructive"}>
            {g.amount > 0 ? "+" : "−"}
            {Math.abs(g.amount)} PX
          </strong>
          {showName && <span className="font-medium text-foreground">{g.character_name}</span>}
          <span className="min-w-0 flex-1 text-muted-foreground">{g.reason}</span>
          <span className="text-[0.65rem] text-muted-foreground">
            {g.granted_by_name} · {formatDateTime(g.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Gestione → Assegna PX: scelta dei personaggi, modulo e registro */
export function XpGrantManager() {
  const supabase = useMemo(() => createClient(), []);
  const [chars, setChars] = useState<{ id: string; name: string }[]>([]);
  const [grants, setGrants] = useState<XpGrant[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const [{ data: c }, { data: g }] = await Promise.all([
      supabase.from("characters").select("id, name").eq("status", "approvata").order("name"),
      supabase.rpc("xp_grants_list", { p_character: null, p_limit: 200 }),
    ]);
    setChars((c ?? []) as { id: string; name: string }[]);
    setGrants((g ?? []) as XpGrant[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const shown = chars.filter((c) => !q || c.name.toLowerCase().includes(q));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm text-peach">Personaggi</strong>
          <span className="text-xs text-muted-foreground">{picked.length} scelti</span>
          {picked.length > 0 && (
            <button type="button" onClick={() => setPicked([])} className="text-xs text-muted-foreground underline hover:text-foreground">
              Togli tutti
            </button>
          )}
          <label className="relative ml-auto">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input className={cn(inputCls, "w-52 pl-8")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca un nome" aria-label="Cerca un personaggio" />
          </label>
        </div>
        <ul className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3">
          {shown.map((c) => {
            const on = picked.includes(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm", on ? "bg-flamingo/25 text-foreground" : "hover:bg-white/10")}
                >
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-flamingo bg-flamingo text-white" : "border-white/30")}>
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="truncate">{c.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <XpGrantForm
        characterIds={picked}
        onDone={() => {
          setPicked([]);
          load();
        }}
      />

      <section className="flex flex-col gap-2">
        <h3 className="font-heading text-xl tracking-wide text-peach">Registro</h3>
        <XpGrantLog grants={grants} />
      </section>
    </div>
  );
}

/** Scheda → Abilità: assegnazione veloce a questo personaggio (staff) e ultime assegnazioni */
export function XpGrantBox({ characterId }: { characterId: string }) {
  const router = useRouter();
  const [grants, setGrants] = useState<XpGrant[]>([]);
  const load = useCallback(async () => {
    const { data } = await createClient().rpc("xp_grants_list", { p_character: characterId, p_limit: 5 });
    setGrants((data ?? []) as XpGrant[]);
  }, [characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-peach/30 bg-peach/10 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Star className="size-4 text-peach" /> Assegna PX
      </p>
      <XpGrantForm
        characterIds={[characterId]}
        onDone={() => {
          load();
          // aggiorna i PX mostrati in scheda
          router.refresh();
        }}
        compact
      />
      {grants.length > 0 && <XpGrantLog grants={grants} showName={false} />}
    </div>
  );
}
