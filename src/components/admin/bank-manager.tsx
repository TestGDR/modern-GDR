"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus, Search } from "lucide-react";
import { ErrorText, FieldLabel, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { MovementList } from "@/components/game/utility";
import { Button } from "@/components/ui/button";
import { bankStaffAdjust } from "@/lib/actions/utility";
import { formatDollars } from "@/lib/bank";
import { createClient } from "@/lib/supabase/client";
import type { BankTransaction } from "@/lib/types";
import { cn } from "@/lib/utils";

export type BankAccountRow = {
  balance: number;
  character: { id: string; name: string; avatar_url: string | null };
};

/** Gestione → Banca: elenco dei conti; aprendone uno si danno/tolgono soldi e si vedono i movimenti */
export function BankManager({ accounts }: { accounts: BankAccountRow[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = accounts.filter((a) => !q || a.character.name.toLowerCase().includes(q));
  const total = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {accounts.length} conti · in tutto {formatDollars(total)}. Entrate, mantenimento e quota iniziale si cambiano in Gestione → Patrimonio; ogni quanti giorni arrivano, in Impostazioni del sistema.
      </p>
      <label className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca un personaggio…" className={cn(inputClass, "pl-9")} aria-label="Cerca un personaggio" />
      </label>
      <ul className="flex flex-col gap-2">
        {shown.map((a) => (
          <li key={a.character.id} className="glass rounded-2xl">
            <button
              type="button"
              onClick={() => setOpen(open === a.character.id ? null : a.character.id)}
              aria-expanded={open === a.character.id}
              className="flex w-full items-center gap-3 p-3 text-left"
            >
              <span className="min-w-0 flex-1 font-medium break-words">{a.character.name}</span>
              <span className="font-semibold tabular-nums text-sand">{formatDollars(a.balance)}</span>
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open === a.character.id && "rotate-180")} />
            </button>
            {open === a.character.id && <AccountDetail characterId={a.character.id} name={a.character.name} balance={a.balance} />}
          </li>
        ))}
        {shown.length === 0 && <li className="text-sm text-muted-foreground">Nessun conto trovato.</li>}
      </ul>
    </div>
  );
}

function AccountDetail({ characterId, name, balance }: { characterId: string; name: string; balance: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [movements, setMovements] = useState<BankTransaction[] | null>(null);
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const { pending, error, setError, execute } = useAdminAction();

  // movimenti del conto (si ricaricano dopo ogni modifica)
  useEffect(() => {
    let alive = true;
    supabase
      .from("bank_transactions")
      .select("*")
      .eq("character_id", characterId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (alive) setMovements((data ?? []) as BankTransaction[]);
      });
    return () => {
      alive = false;
    };
  }, [supabase, characterId, version]);

  return (
    <div className="flex flex-col gap-4 border-t border-white/10 p-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setDone(null);
          const n = Number(amount);
          if (!Number.isInteger(n) || n < 1) return setError("Indica quanti dollari (un numero intero).");
          if (!reason.trim()) return setError("Scrivi il motivo: il giocatore lo vede nei movimenti.");
          const verb = sign > 0 ? "Dare" : "Togliere";
          if (!window.confirm(`${verb} ${formatDollars(n)} a ${name}?`)) return;
          execute(
            () => bankStaffAdjust(characterId, sign * n, reason),
            () => {
              setDone(sign > 0 ? `Dati ${formatDollars(n)} a ${name}.` : `Tolti ${formatDollars(n)} a ${name}.`);
              setAmount("");
              setReason("");
              setVersion((v) => v + 1);
            },
          );
        }}
      >
        <ErrorText error={error} />
        {done && <p className="text-sm text-mint">{done}</p>}
        <div className="flex gap-1" role="radiogroup" aria-label="Dare o togliere">
          {([1, -1] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={sign === s}
              onClick={() => setSign(s)}
              className={cn(
                "flex items-center gap-1 rounded-full px-4 py-1.5 text-sm",
                sign === s ? (s > 0 ? "bg-mint/20 text-mint" : "bg-flamingo/20 text-flamingo") : "text-muted-foreground hover:bg-white/5",
              )}
            >
              {s > 0 ? <Plus className="size-4" /> : <Minus className="size-4" />} {s > 0 ? "Dai" : "Togli"}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <FieldLabel label="Dollari">
            <input className={inputClass} type="number" min={1} max={sign < 0 ? balance : undefined} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FieldLabel>
          <FieldLabel label="Motivo" hint="Lo vede il giocatore, con un messaggio di SISTEMA">
            <input className={inputClass} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Es. Premio dell'evento di Halloween" />
          </FieldLabel>
        </div>
        <Button type="submit" disabled={pending} className="w-fit self-end rounded-full px-6">
          {pending ? "Salvataggio…" : sign > 0 ? "Dai i soldi" : "Togli i soldi"}
        </Button>
      </form>
      <div>
        <p className="mb-1 text-sm font-medium">Movimenti</p>
        {movements === null ? <p className="text-sm text-muted-foreground">Caricamento…</p> : <MovementList transactions={movements} />}
      </div>
    </div>
  );
}
