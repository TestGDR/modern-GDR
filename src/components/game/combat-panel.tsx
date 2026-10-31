"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag, HandMetal, LogOut, Shield, Swords, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatPresent } from "@/lib/data";
import { firstName } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import type { CombatAction, CombatActionKind, CombatDefense, CombatParticipant, CombatZone, Combat } from "@/lib/types";
import { cn } from "@/lib/utils";

// Combattimento in chat (Fase A, a mani nude). Tutti i tiri li fa il database:
// qui si sceglie solo cosa fare. In chat compare l'esito, i numeri li vede lo staff.

export const ACTION_LABEL: Record<CombatActionKind, string> = {
  normale: "Attacco normale",
  veloce: "Attacco veloce (2 colpi, −3 ciascuno)",
  forte: "Attacco forte (−3, danno ×1,5)",
  mirato: "Attacco mirato",
  spingere: "Spingere a terra (−2, niente danno)",
  afferrare: "Afferrare (−2, niente danno)",
};
export const ZONE_LABEL: Record<CombatZone, string> = { testa: "Testa (−6)", tronco: "Tronco (−1)", braccio: "Braccio (−3)", gamba: "Gamba (−2)" };
const DEFENSE_LABEL: Record<CombatDefense, string> = { schivare: "Schivare", parare: "Parare", incassare: "Incassare" };
const CONDITION_LABEL = { a_terra: "a terra", trattenuto: "trattenuto" } as const;

type Props = {
  roomId: string;
  me: { id: string; name: string } | null;
  present: ChatPresent[];
  /** Master o staff del combattimento: decide le difese e chiude lo scontro */
  isMaster: boolean;
  /** Cresce a ogni messaggio di combattimento in chat: si ricarica */
  tick: number;
  /** Pannello per avviare lo scontro aperto dal pulsante della chat */
  starting: boolean;
  onCloseStart: () => void;
  onError: (e: string | null) => void;
};

type Fight = { combat: Combat; people: CombatParticipant[]; pending: CombatAction | null };

export function CombatPanel({ roomId, me, present, isMaster, tick, starting, onCloseStart, onError }: Props) {
  const supabase = useMemo(() => createClient(), []);
  // tutti gli scontri in corso nella chat (possono essere più d'uno)
  const [fights, setFights] = useState<Fight[]>([]);
  const [busy, setBusy] = useState(false);
  // scontri chiusi nel pannello (solo per chi guarda, non per gli altri)
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const load = useCallback(async () => {
    const { data: combats } = await supabase.from("combats").select("*").eq("room_id", roomId).eq("status", "in_corso").order("number");
    const list = (combats ?? []) as Combat[];
    if (list.length === 0) return setFights([]);
    const ids = list.map((c) => c.id);
    const [{ data: people }, { data: pending }] = await Promise.all([
      supabase.from("combat_participants").select("*").in("combat_id", ids),
      supabase.from("combat_actions").select("*").in("combat_id", ids).eq("status", "attesa_difesa"),
    ]);
    const ppl = (people ?? []) as CombatParticipant[];
    const pend = (pending ?? []) as CombatAction[];
    setFights(list.map((c) => ({ combat: c, people: ppl.filter((p) => p.combat_id === c.id), pending: pend.find((a) => a.combat_id === c.id) ?? null })));
  }, [supabase, roomId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura iniziale e a ogni messaggio di combattimento
    load();
  }, [load, tick]);
  useResync(load);

  // una sola azione alla volta: niente doppi clic
  async function run(fn: string, args: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    await load();
    if (error) {
      onError(error.message);
      return false;
    }
    return true;
  }

  // chi sta già combattendo (e dove): un personaggio è in un solo scontro alla volta
  const engagedIn = new Map<string, number>();
  for (const f of fights) for (const p of f.people) if (!p.out) engagedIn.set(p.character_id, f.combat.number);
  const myFight = me ? fights.find((f) => f.people.some((p) => p.character_id === me.id && !p.out)) : undefined;
  const many = fights.length > 1;
  // il mio scontro per primo
  const ordered = myFight ? [myFight, ...fights.filter((f) => f !== myFight)] : fights;

  if (fights.length === 0 && !(starting && me)) return null;
  return (
    <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
      {starting && me && (
        myFight ? (
          <p className="flex items-center gap-2 rounded-2xl border border-flamingo/40 bg-night/80 p-3 text-sm">
            <Swords className="size-4 shrink-0 text-flamingo" />
            Sei già nello scontro {myFight.combat.number}: per iniziarne un altro prima abbandonalo.
            <button type="button" onClick={onCloseStart} className="ml-auto rounded p-1 text-muted-foreground hover:bg-white/10" aria-label="Chiudi">
              <X className="size-4" />
            </button>
          </p>
        ) : (
          <StartPanel
            me={me}
            present={present}
            engagedIn={engagedIn}
            others={fights.length}
            busy={busy}
            onClose={onCloseStart}
            onStart={async (ids) => (await run("combat_start", { p_room: roomId, p_character: me.id, p_opponents: ids })) && onCloseStart()}
          />
        )
      )}
      {ordered.map((f) => (
        <FightCard
          key={f.combat.id}
          fight={f}
          me={me}
          isMaster={isMaster}
          busy={busy}
          showNumber={many}
          canJoin={!!me && !myFight}
          open={!collapsed.includes(f.combat.id) || f === myFight}
          onToggle={() => setCollapsed((c) => (c.includes(f.combat.id) ? c.filter((x) => x !== f.combat.id) : [...c, f.combat.id]))}
          run={run}
        />
      ))}
    </div>
  );
}

/** Uno scontro: ordine di turno, attacco in attesa, il mio turno */
function FightCard({
  fight,
  me,
  isMaster,
  busy,
  showNumber,
  canJoin,
  open,
  onToggle,
  run,
}: {
  fight: Fight;
  me: { id: string; name: string } | null;
  isMaster: boolean;
  busy: boolean;
  showNumber: boolean;
  /** non sono in nessuno scontro: posso entrare in questo */
  canJoin: boolean;
  open: boolean;
  onToggle: () => void;
  run: (fn: string, args: Record<string, unknown>) => Promise<boolean>;
}) {
  const { combat, people, pending } = fight;
  const byId = new Map(people.map((p) => [p.character_id, p]));
  const name = (id: string | undefined) => firstName(byId.get(id ?? "")?.name ?? "…");
  const order = combat.turn_order.map((id) => byId.get(id)).filter((p): p is CombatParticipant => !!p);
  const current = combat.turn_order[combat.turn_index];
  const mine = me ? byId.get(me.id) : undefined;
  const inside = !!mine && !mine.out;
  const myTurn = !!me && current === me.id && inside && !pending;
  const defendAs = pending && ((me && pending.target_id === me.id) || isMaster) ? pending.target_id : null;
  const waitingOnMe = !!defendAs || myTurn;

  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border bg-night/80 p-3 backdrop-blur", inside || waitingOnMe ? "border-flamingo/60" : "border-white/15")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" onClick={onToggle} className="flex items-center gap-2" aria-expanded={open}>
          <Swords className="size-4 text-flamingo" />
          <span className="font-heading text-lg tracking-wide text-flamingo">
            Scontro{showNumber ? ` ${combat.number}` : ""} · round {combat.round}
          </span>
        </button>
        <ol className="flex flex-wrap items-center gap-1 text-xs">
          {order.map((p) => (
            <li
              key={p.character_id}
              className={cn(
                "rounded-full px-2 py-0.5",
                p.out ? "bg-white/5 text-muted-foreground line-through" : p.character_id === current ? "bg-flamingo text-white" : "bg-white/10",
              )}
              title={p.out ? "Fuori dallo scontro" : p.character_id === current ? "Tocca a lui/lei" : undefined}
            >
              {firstName(p.name)}
              {p.condition && !p.out && <span className="ml-1 text-peach">({CONDITION_LABEL[p.condition]})</span>}
            </li>
          ))}
        </ol>
        <span className="ml-auto flex gap-1">
          {me && canJoin && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} className="rounded-full" onClick={() => run("combat_join", { p_combat: combat.id, p_character: me.id })}>
              <UserPlus /> Entra
            </Button>
          )}
          {me && inside && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              className="rounded-full"
              onClick={() => window.confirm("Abbandonare lo scontro?") && run("combat_leave", { p_combat: combat.id, p_character: me.id })}
            >
              <LogOut /> Abbandona
            </Button>
          )}
          {isMaster && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              className="rounded-full text-destructive"
              onClick={() => window.confirm(`Chiudere lo scontro${showNumber ? ` ${combat.number}` : ""} per tutti?`) && run("combat_end", { p_combat: combat.id })}
            >
              <Flag /> Chiudi
            </Button>
          )}
        </span>
      </div>

      {!open ? null : pending ? (
        <div className="flex flex-col gap-2 rounded-xl border border-peach/30 bg-peach/10 p-2.5 text-sm">
          <p>
            <strong className="text-peach">{name(pending.attacker_id)}</strong>: {ACTION_LABEL[pending.action].split(" (")[0].toLowerCase()}
            {pending.action === "mirato" && pending.zone_aimed ? ` (${pending.zone_aimed})` : ""} contro{" "}
            <strong className="text-peach">{name(pending.target_id)}</strong>.{" "}
            {defendAs ? (me && pending.target_id === me.id ? "Come ti difendi?" : `Master: scegli tu la difesa di ${name(pending.target_id)}.`) : `Aspettiamo la difesa di ${name(pending.target_id)}.`}
          </p>
          {defendAs && (
            <div className="flex flex-wrap gap-2">
              {(Object.keys(DEFENSE_LABEL) as CombatDefense[]).map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={d === "incassare" ? "ghost" : "default"}
                  disabled={busy}
                  className="rounded-full"
                  onClick={() => run("combat_defend", { p_action: pending.id, p_character: defendAs, p_defense: d })}
                >
                  {d === "incassare" ? <HandMetal /> : <Shield />} {DEFENSE_LABEL[d]}
                </Button>
              ))}
              <span className="self-center text-xs text-muted-foreground">Incassare: nessun tiro, il colpo va a segno.</span>
            </div>
          )}
        </div>
      ) : myTurn && me ? (
        <AttackForm
          targets={order.filter((p) => !p.out && p.character_id !== me.id)}
          busy={busy}
          onAttack={(target, action, zone) => run("combat_attack", { p_combat: combat.id, p_character: me.id, p_target: target, p_action: action, p_zone: zone })}
          onPass={() => run("combat_pass", { p_combat: combat.id, p_character: me.id })}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Tocca a <strong className="text-foreground">{name(current)}</strong>.
          {isMaster && (
            <button type="button" disabled={busy} onClick={() => run("combat_pass", { p_combat: combat.id, p_character: current })} className="ml-2 underline hover:text-foreground">
              Master: salta il turno
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** Scelta degli avversari tra i presenti in giocata (chi è già in un altro scontro non si può scegliere) */
function StartPanel({
  me,
  present,
  engagedIn,
  others,
  busy,
  onClose,
  onStart,
}: {
  me: { id: string };
  present: ChatPresent[];
  engagedIn: Map<string, number>;
  /** scontri già in corso nella chat */
  others: number;
  busy: boolean;
  onClose: () => void;
  onStart: (ids: string[]) => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const candidates = present.filter((p) => p.character_id !== me.id);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-flamingo/40 bg-night/80 p-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <Swords className="size-4 text-flamingo" />
        <p className="font-heading text-lg tracking-wide text-flamingo">{others > 0 ? "Inizia un altro scontro" : "Inizia uno scontro"}</p>
        <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-muted-foreground hover:bg-white/10" aria-label="Chiudi">
          <X className="size-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Scegli contro chi combatti (anche più di uno). L&apos;iniziativa (RIF + d10) la tira il server e decide l&apos;ordine dei turni. Gli altri presenti potranno entrare dopo.
        {others > 0 && " In questa chat ci sono già altri scontri: puoi anche entrare in uno di quelli qui sotto."}
      </p>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Non c&apos;è nessun altro in giocata in questa chat.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {candidates.map((p) => {
            const on = chosen.includes(p.character_id);
            const busyIn = engagedIn.get(p.character_id);
            return (
              <button
                key={p.character_id}
                type="button"
                aria-pressed={on}
                disabled={busyIn !== undefined}
                onClick={() => setChosen((c) => (on ? c.filter((x) => x !== p.character_id) : [...c, p.character_id]))}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm disabled:opacity-40",
                  on ? "border-flamingo bg-flamingo/25 text-white" : "border-white/15 bg-white/5 hover:bg-white/10",
                )}
                title={busyIn !== undefined ? `Sta già combattendo (scontro ${busyIn})` : undefined}
              >
                {firstName(p.name)}
                {busyIn !== undefined && <span className="ml-1 text-xs text-muted-foreground">· in scontro {busyIn}</span>}
              </button>
            );
          })}
        </div>
      )}
      <Button type="button" disabled={busy || chosen.length === 0} onClick={() => onStart(chosen)} className="w-fit rounded-full">
        <Swords /> Inizia lo scontro
      </Button>
    </div>
  );
}

/** Il mio turno: bersaglio, azione, zona (se mirato) e conferma */
function AttackForm({
  targets,
  busy,
  onAttack,
  onPass,
}: {
  targets: CombatParticipant[];
  busy: boolean;
  onAttack: (target: string, action: CombatActionKind, zone: CombatZone | null) => void;
  onPass: () => void;
}) {
  const [target, setTarget] = useState("");
  const [action, setAction] = useState<CombatActionKind>("normale");
  const [zone, setZone] = useState<CombatZone>("tronco");
  const chosen = targets.some((t) => t.character_id === target) ? target : (targets[0]?.character_id ?? "");
  const select = "h-9 min-w-0 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none focus-visible:border-ring";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-mint">Tocca a te: scegli l&apos;azione.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={chosen} onChange={(e) => setTarget(e.target.value)} aria-label="Bersaglio" className={select}>
          {targets.map((t) => (
            <option key={t.character_id} value={t.character_id}>
              {firstName(t.name)}
            </option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value as CombatActionKind)} aria-label="Azione" className={cn(select, "flex-1 sm:flex-none")}>
          {(Object.keys(ACTION_LABEL) as CombatActionKind[]).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a]}
            </option>
          ))}
        </select>
        {action === "mirato" && (
          <select value={zone} onChange={(e) => setZone(e.target.value as CombatZone)} aria-label="Zona" className={select}>
            {(Object.keys(ZONE_LABEL) as CombatZone[]).map((z) => (
              <option key={z} value={z}>
                {ZONE_LABEL[z]}
              </option>
            ))}
          </select>
        )}
        <Button type="button" size="sm" disabled={busy || !chosen} onClick={() => onAttack(chosen, action, action === "mirato" ? zone : null)} className="rounded-full">
          <Swords /> Conferma
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onPass} className="rounded-full">
          Passa
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ Dettaglio dei tiri (staff) ------------------------------ */

type Roll = { rif?: number; abilita?: number; dadi?: number[] | null; d10?: number | null; tratti?: number; azione?: number; ferite?: number; totale?: number | null; tipo?: string };
type Hit = {
  colpo: number;
  attacco: Roll;
  difesa: Roll;
  riuscito: boolean;
  margine: number;
  manovra?: string;
  danno?: { vig: number; d4: number; base: number; forte: boolean; zona: string; dado_zona: number | null; critico: string | null; extra: number; penalita: number; totale: number };
  pf?: { prima: number; dopo: number; max: number };
};
type Detail =
  | { tipo: "iniziativa"; tiri: { character_id: string; iniziativa: { rif: number; mods: number; dice: number[]; d10: number; total: number } }[] }
  | { tipo: "attacco"; azione: string; difesa: string; colpi: Hit[] };

const dice = (d: number[] | null | undefined) => (d && d.length > 1 ? `[${d.join("+")}]` : "");
const sign = (n: number | undefined) => (n ? (n > 0 ? ` + ${n}` : ` − ${-n}`) : "");

/** I numeri di un messaggio di combattimento (li legge solo chi può: RLS) */
export function CombatDetail({ messageId }: { messageId: number }) {
  const supabase = useMemo(() => createClient(), []);
  const [detail, setDetail] = useState<Detail | null | "nessuno">(null);
  useEffect(() => {
    supabase
      .from("combat_log")
      .select("detail")
      .eq("message_id", messageId)
      .maybeSingle<{ detail: Detail }>()
      .then(({ data }) => setDetail(data?.detail ?? "nessuno"));
  }, [supabase, messageId]);

  if (detail === null) return <p className="text-xs text-muted-foreground">Carico…</p>;
  if (detail === "nessuno") return <p className="text-xs text-muted-foreground">Nessun tiro in questo messaggio.</p>;
  if (detail.tipo === "iniziativa") {
    return (
      <ul className="text-xs text-muted-foreground">
        {detail.tiri.map((t) => (
          <li key={t.character_id}>
            Iniziativa: RIF {t.iniziativa.rif} + d10 {t.iniziativa.d10}
            {dice(t.iniziativa.dice)}
            {sign(t.iniziativa.mods)} = <strong className="text-foreground">{t.iniziativa.total}</strong>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
      {detail.colpi.map((c) => (
        <li key={c.colpo}>
          {detail.colpi.length > 1 && <strong className="text-foreground">Colpo {c.colpo}. </strong>}
          Attacco: RIF {c.attacco.rif} + Rissa {c.attacco.abilita} + d10 {c.attacco.d10}
          {dice(c.attacco.dadi)}
          {sign(c.attacco.tratti)}
          {sign(c.attacco.azione)}
          {sign(c.attacco.ferite)} = <strong className="text-foreground">{c.attacco.totale}</strong>
          {" · "}
          {c.difesa.tipo === "incassare" ? (
            "Incassa (soglia 10)"
          ) : (
            <>
              {c.difesa.tipo === "schivare" ? "Schivare" : "Parare"}: RIF {c.difesa.rif} + {c.difesa.abilita} + d10 {c.difesa.d10}
              {dice(c.difesa.dadi)}
              {sign(c.difesa.tratti)}
              {sign(c.difesa.ferite)} = <strong className="text-foreground">{c.difesa.totale}</strong>
            </>
          )}
          {" · "}margine {c.margine} {c.riuscito ? "→ a segno" : "→ mancato"}
          {c.danno && (
            <>
              <br />
              Danno: d4 {c.danno.d4} (VIG {c.danno.vig}) → {c.danno.base}
              {c.danno.forte && " ×1,5"} · {c.danno.zona}
              {c.danno.dado_zona !== null ? ` (d10 ${c.danno.dado_zona})` : " (mirato)"}
              {c.danno.critico && ` · ${c.danno.critico.replace("_", " ")} +${c.danno.extra}${c.danno.penalita ? `, penalità ${c.danno.penalita}` : ""}`} ={" "}
              <strong className="text-foreground">{c.danno.totale} PF</strong>
            </>
          )}
          {c.pf && (
            <>
              {" · "}PF {c.pf.prima} → <strong className="text-foreground">{c.pf.dopo}</strong>/{c.pf.max}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
