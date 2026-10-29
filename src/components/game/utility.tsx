"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Check, HandCoins, Pencil, Search, SendHorizontal, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NeedsCharacter } from "@/components/game/needs-character";
import { bankTransfer, setFaceClaim } from "@/lib/actions/utility";
import { formatDay, formatDollars, formatMoment, periodLabel } from "@/lib/bank";
import type { BankOverview, BankTransaction, CharacterStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Personaggio negli elenchi dell'Utility */
export type UtilityPerson = {
  id: string;
  name: string;
  avatar_url: string | null;
  occupation: string | null;
  face_claim: string | null;
  status: CharacterStatus;
};

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function BackToUtility() {
  return (
    <Link href="/utility" className="mb-3 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Utility
    </Link>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>;
}

/* ------------------------------ Indice A-Z ------------------------------ */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Iniziale senza accenti ("É" → "E"); "#" per numeri e simboli */
function initial(text: string) {
  const c = text.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
  return LETTERS.includes(c) ? c : "#";
}

/** Ricerca + lettere: restituisce i gruppi per iniziale */
function useIndex<T>(items: T[], keyOf: (item: T) => string, searchOf: (item: T) => string) {
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const found = items.filter((i) => !q || searchOf(i).toLowerCase().includes(q));
  const available = new Set(found.map((i) => initial(keyOf(i))));
  const shown = letter ? found.filter((i) => initial(keyOf(i)) === letter) : found;
  const groups = [...LETTERS, "#"]
    .map((l) => ({ letter: l, items: shown.filter((i) => initial(keyOf(i)) === l) }))
    .filter((g) => g.items.length > 0);
  return { query, setQuery, letter, setLetter, available, groups };
}

function IndexBar({
  query,
  setQuery,
  letter,
  setLetter,
  available,
  placeholder,
}: {
  query: string;
  setQuery: (q: string) => void;
  letter: string | null;
  setLetter: (l: string | null) => void;
  available: Set<string>;
  placeholder: string;
}) {
  const letters = available.has("#") ? [...LETTERS, "#"] : LETTERS;
  return (
    <div className="flex flex-col gap-3">
      <label className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} className={cn(inputCls, "pl-9")} aria-label={placeholder} />
      </label>
      <nav aria-label="Indice alfabetico" className="flex flex-wrap gap-1">
        <LetterButton label="Tutti" active={letter === null} onClick={() => setLetter(null)} />
        {letters.map((l) => (
          <LetterButton key={l} label={l} active={letter === l} disabled={!available.has(l)} onClick={() => setLetter(l)} />
        ))}
      </nav>
    </div>
  );
}

function LetterButton({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "min-w-7 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-flamingo text-white" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
        disabled && "pointer-events-none opacity-30",
      )}
    >
      {label}
    </button>
  );
}

function Portrait({ person, size = "size-11" }: { person: Pick<UtilityPerson, "name" | "avatar_url">; size?: string }) {
  return person.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.avatar_url} alt="" className={cn(size, "shrink-0 rounded-xl object-cover")} />
  ) : (
    <span className={cn(size, "grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet to-flamingo font-heading text-lg text-white")}>
      {person.name.charAt(0).toUpperCase()}
    </span>
  );
}

/* ------------------------------ Anagrafe ------------------------------ */

/** Riga dell'anagrafe (funzione registry del database): un iscritto */
export type RegistryEntry = {
  user_id: string;
  username: string;
  /** Solo se la scheda è approvata */
  character_id: string | null;
  status: CharacterStatus | null;
  avatar_url: string | null;
  occupation: string | null;
  face_claim: string | null;
};

const STATUS_NOTE: Record<CharacterStatus | "none", string> = {
  approvata: "",
  in_attesa: "Scheda in approvazione",
  bozza: "Scheda in creazione",
  rifiutata: "Scheda da correggere",
  none: "Scheda non ancora creata",
};

/** Tutti gli iscritti, con ricerca e indice A-Z */
export function Registry({ people }: { people: RegistryEntry[] }) {
  const idx = useIndex(
    people,
    (p) => p.username,
    (p) => `${p.username} ${p.occupation ?? ""} ${p.face_claim ?? ""}`,
  );
  const active = people.filter((p) => p.character_id).length;
  return (
    <div className="flex flex-col gap-4">
      <IndexBar {...idx} placeholder="Cerca per nome, lavoro o prestavolto…" />
      <p className="text-xs text-muted-foreground">
        {people.length} {people.length === 1 ? "iscritto" : "iscritti"}, {active} con la scheda approvata. Clicca un nome per aprire la scheda.
      </p>
      {idx.groups.map((g) => (
        <section key={g.letter}>
          <h2 className="mb-2 border-b border-white/10 pb-1 font-heading text-2xl tracking-wide text-peach">{g.letter}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((p) => {
              const body = (
                <>
                  <Portrait person={{ name: p.username, avatar_url: p.avatar_url }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words">{p.username}</span>
                    {p.occupation && <span className="block truncate text-xs text-muted-foreground">{p.occupation}</span>}
                    {p.face_claim && <span className="block truncate text-xs text-lavender">{p.face_claim}</span>}
                    {!p.character_id && <span className="block text-xs text-muted-foreground italic">{STATUS_NOTE[p.status ?? "none"]}</span>}
                  </span>
                </>
              );
              return (
                <li key={p.user_id}>
                  {p.character_id ? (
                    <Link href={`/scheda/${p.character_id}`} className="flex items-center gap-3 rounded-2xl bg-white/5 p-2.5 transition-colors hover:bg-white/10">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-2.5 opacity-70">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {idx.groups.length === 0 && <p className="text-sm text-muted-foreground">Nessun iscritto trovato.</p>}
    </div>
  );
}

/* ------------------------------ Prestavolti ------------------------------ */

type FaceClaimsProps = {
  people: UtilityPerson[];
  /** Il personaggio del giocatore (null se non l'ha ancora creato) */
  mine: Pick<UtilityPerson, "id" | "name" | "face_claim"> | null;
  canManage: boolean;
};

export function FaceClaims({ people, mine, canManage }: FaceClaimsProps) {
  const idx = useIndex(
    people,
    (p) => p.face_claim ?? "",
    (p) => `${p.face_claim ?? ""} ${p.name}`,
  );
  return (
    <div className="flex flex-col gap-5">
      <MyFaceClaim mine={mine} />
      <IndexBar {...idx} placeholder="Cerca un prestavolto o un personaggio…" />
      {idx.groups.map((g) => (
        <section key={g.letter}>
          <h2 className="mb-1 border-b border-white/10 pb-1 font-heading text-2xl tracking-wide text-peach">{g.letter}</h2>
          <ul className="divide-y divide-white/5">
            {g.items.map((p) => (
              <FaceClaimRow key={p.id} person={p} canManage={canManage} />
            ))}
          </ul>
        </section>
      ))}
      {idx.groups.length === 0 && (
        <p className="text-sm text-muted-foreground">{people.length === 0 ? "Nessun prestavolto registrato." : "Nessun prestavolto trovato."}</p>
      )}
    </div>
  );
}

function MyFaceClaim({ mine }: { mine: FaceClaimsProps["mine"] }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!mine) return <NeedsCharacter className="glass rounded-2xl" text="Per registrare il tuo prestavolto crea prima il personaggio." />;
  if (mine.face_claim) {
    return (
      <div className="glass rounded-2xl p-4 text-sm">
        <p>
          Il prestavolto di <strong>{mine.name}</strong> è <strong className="text-peach">{mine.face_claim}</strong>.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Per cambiarlo scrivi allo staff con un <Link href="/ticket" className="text-lavender underline">ticket</Link>.
        </p>
      </div>
    );
  }
  return (
    <form
      className="glass flex flex-col gap-3 rounded-2xl p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const name = value.trim();
        if (name.length < 2) return setError("Scrivi il nome del prestavolto.");
        if (!window.confirm(`Registrare «${name}» come prestavolto di ${mine.name}? Una volta salvato potrà cambiarlo solo lo staff.`)) return;
        setError(null);
        start(async () => {
          const r = await setFaceClaim(mine.id, name);
          if (!r.ok) setError(r.error ?? "Operazione non riuscita.");
        });
      }}
    >
      <p className="text-sm">
        Registra il prestavolto di <strong>{mine.name}</strong>: la persona reale che dà il volto al personaggio. Ognuno è unico in città.
      </p>
      <ErrorLine error={error} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} placeholder="Nome e cognome, es. Zendaya" className={inputCls} aria-label="Prestavolto" />
        <Button type="submit" disabled={pending} className="h-10 rounded-full px-5">
          {pending ? "Salvataggio…" : "Registra"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Attenzione: una volta salvato non si cambia più, se non dallo staff.</p>
    </form>
  );
}

function FaceClaimRow({ person, canManage }: { person: UtilityPerson; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(person.face_claim ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(next: string) {
    setError(null);
    start(async () => {
      const r = await setFaceClaim(person.id, next);
      if (r.ok) setEditing(false);
      else setError(r.error ?? "Operazione non riuscita.");
    });
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 py-2">
        <ErrorLine error={error} />
        <div className="flex flex-wrap items-center gap-2">
          <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} className={cn(inputCls, "min-w-48 flex-1")} aria-label={`Prestavolto di ${person.name}`} />
          <Button type="button" size="sm" disabled={pending} onClick={() => save(value)} className="rounded-full">
            <Check /> Salva
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => window.confirm(`Togliere il prestavolto a ${person.name}? Potrà sceglierne un altro.`) && save("")}
          >
            Togli
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Annulla">
            <X />
          </Button>
        </div>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="min-w-40 flex-1 font-medium">{person.face_claim}</span>
      <Link href={`/scheda/${person.id}`} className="text-sm text-lavender hover:underline">
        {person.name}
      </Link>
      {person.status !== "approvata" && <span className="text-xs text-muted-foreground">(scheda non ancora approvata)</span>}
      {canManage && (
        <button type="button" onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label={`Cambia il prestavolto di ${person.name}`}>
          <Pencil className="size-4" />
        </button>
      )}
    </li>
  );
}

/* ------------------------------ Banca ------------------------------ */

type BankAppProps = {
  character: { id: string; name: string } | null;
  overview: BankOverview | null;
  transactions: BankTransaction[];
  /** Personaggi a cui si possono mandare soldi (degli altri giocatori) */
  recipients: Pick<UtilityPerson, "id" | "name" | "avatar_url">[];
};

export function BankApp({ character, overview, transactions, recipients }: BankAppProps) {
  if (!character || !overview) return <NeedsCharacter className="glass rounded-2xl" text="Per usare la banca serve un personaggio approvato." />;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Balance overview={overview} />
        <Salary overview={overview} />
      </div>
      <Transfer characterId={character.id} balance={overview.balance} recipients={recipients} />
      <Movements transactions={transactions} />
    </div>
  );
}

function Balance({ overview }: { overview: BankOverview }) {
  return (
    <section className="glass flex flex-col gap-1 rounded-2xl p-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Wallet className="size-4 text-mint" /> Saldo del conto
      </p>
      <p className={cn("font-heading text-5xl tracking-wide", overview.balance < 0 ? "text-flamingo" : "text-sunset")}>
        {overview.balance < 0 ? "−" : ""}
        {formatDollars(Math.abs(overview.balance))}
      </p>
      {overview.balance < 0 && <p className="text-xs text-flamingo">Conto in rosso: il mantenimento costa più di quello che entra.</p>}
    </section>
  );
}

function Salary({ overview }: { overview: BankOverview }) {
  const net = overview.income - overview.upkeep;
  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <HandCoins className="size-4 text-sand" /> Entrate e uscite {periodLabel(overview.period_days)}
      </p>
      <ul className="flex flex-col gap-0.5 text-sm">
        {overview.income_parts.map((p) => (
          <li key={p.label} className="flex justify-between gap-3">
            <span>{p.label}</span>
            <span className="text-mint tabular-nums">+{formatDollars(p.amount)}</span>
          </li>
        ))}
        {overview.upkeep > 0 && (
          <li className="flex justify-between gap-3">
            <span>Mantenimento del patrimonio</span>
            <span className="text-flamingo tabular-nums">−{formatDollars(overview.upkeep)}</span>
          </li>
        )}
        {overview.income_parts.length === 0 && overview.upkeep === 0 && (
          <li className="text-muted-foreground">
            Nessuna entrata: la danno il patrimonio, i <Link href="/utility/lavori" className="text-lavender underline">lavori</Link> e i gruppi.
          </li>
        )}
        <li className="mt-1 flex justify-between gap-3 border-t border-white/10 pt-1 font-medium">
          <span>Totale</span>
          <span className={cn("tabular-nums", net >= 0 ? "text-mint" : "text-flamingo")}>
            {net >= 0 ? "+" : "−"}
            {formatDollars(Math.abs(net))}
          </span>
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">Arriva da solo sul conto il {formatDay(overview.next_on)}, con un messaggio di SISTEMA.</p>
    </section>
  );
}

function Transfer({ characterId, balance, recipients }: { characterId: string; balance: number; recipients: BankAppProps["recipients"] }) {
  const [query, setQuery] = useState("");
  const [to, setTo] = useState<BankAppProps["recipients"][number] | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const q = query.trim().toLowerCase();
  const matches = q ? recipients.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 6) : [];

  return (
    <form
      className="glass flex flex-col gap-3 rounded-2xl p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(null);
        const n = Number(amount);
        if (!to) return setError("Scegli a chi mandare i soldi.");
        if (!Number.isInteger(n) || n < 1) return setError("Indica quanti dollari mandare (un numero intero).");
        if (n > balance) return setError("Sul conto non ci sono abbastanza dollari.");
        if (!window.confirm(`Mandare ${formatDollars(n)} a ${to.name}?`)) return;
        start(async () => {
          const r = await bankTransfer(characterId, to.id, n, reason);
          if (r.ok) {
            setDone(`Hai mandato ${formatDollars(n)} a ${to.name}.`);
            setAmount("");
            setReason("");
            setTo(null);
          } else setError(r.error ?? "Operazione non riuscita.");
        });
      }}
    >
      <p className="flex items-center gap-2 font-heading text-2xl tracking-wide">
        <SendHorizontal className="size-5 text-flamingo" /> Manda soldi
      </p>
      <ErrorLine error={error} />
      {done && <p className="text-sm text-mint">{done}</p>}
      {to ? (
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2">
          <Portrait person={to} size="size-9" />
          <span className="flex-1 font-medium">{to.name}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setTo(null)}>
            Cambia
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="A chi? Scrivi il nome del personaggio" className={inputCls} aria-label="Destinatario" />
          {matches.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-xl bg-night/60 p-1">
              {matches.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setTo(r);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10"
                  >
                    <Portrait person={r} size="size-7" /> {r.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q && matches.length === 0 && <p className="text-xs text-muted-foreground">Nessun personaggio con questo nome.</p>}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={1} max={balance} inputMode="numeric" placeholder="Dollari" className={inputCls} aria-label="Dollari" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Causale (facoltativa), es. «Per la cena»" className={inputCls} aria-label="Causale" />
      </div>
      <Button type="submit" disabled={pending} className="w-fit self-end rounded-full px-6">
        {pending ? "Invio…" : "Manda"}
      </Button>
    </form>
  );
}

function Movements({ transactions }: { transactions: BankTransaction[] }) {
  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-5">
      <p className="font-heading text-2xl tracking-wide">Movimenti</p>
      <MovementList transactions={transactions} />
    </section>
  );
}

/** Elenco dei movimenti (anche nel pannello di gestione) */
export function MovementList({ transactions }: { transactions: BankTransaction[] }) {
  if (transactions.length === 0) return <p className="text-sm text-muted-foreground">Nessun movimento.</p>;
  return (
    <ul className="divide-y divide-white/5">
      {transactions.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
          {t.amount > 0 ? <ArrowDownLeft className="size-4 shrink-0 text-mint" /> : <ArrowUpRight className="size-4 shrink-0 text-flamingo" />}
          <span className="min-w-0 flex-1">
            <span className="block break-words">{t.description}</span>
            <span className="block text-xs text-muted-foreground">
              {formatMoment(t.created_at)} · saldo {formatDollars(t.balance_after)}
            </span>
          </span>
          <span className={cn("shrink-0 font-semibold tabular-nums", t.amount > 0 ? "text-mint" : "text-flamingo")}>
            {t.amount > 0 ? "+" : "−"}
            {formatDollars(Math.abs(t.amount))}
          </span>
        </li>
      ))}
    </ul>
  );
}
