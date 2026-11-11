"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dices, Loader2, Megaphone, Save } from "lucide-react";
import { PushPicker, type Push } from "@/components/sport/push-picker";
import { Button } from "@/components/ui/button";
import { SQUAD_LABEL, eventDate, venueText } from "@/lib/sport";
import { createClient } from "@/lib/supabase/client";
import type { Sport, SportRosterEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

// Convocazioni: l'Amministratore sceglie chi gareggia (Gestione → Sport → Convoca),
// il convocato preme «Gareggia» entro il giorno prima della gara (pagina Sport).
// I tiri li fa il database (sport_callup_roll); chi non tira viene simulato.

type CallupRoll = { total: number; cd: number; grade: number; crit: "none" | "success" | "failure" } | null;
/** Discorso del capitano di una gara */
type Morale = { event_id: string; success: boolean; total: number; cd: number; auto: boolean };
type EventInfo = {
  id: string;
  sport_id: string;
  starts_at: string;
  status: string;
  venue: "home" | "away" | "neutral";
  site: string;
  sport: { name: string; icon: string } | null;
  teams: { team: { name: string; is_player_school: boolean } | null }[];
};

/** "AAAA-MM-GG" del giorno in ora italiana */
const romeDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

/** Si può ancora tirare? (fino alla mezzanotte del giorno della gara) */
function canStillRoll(startsAt: string) {
  return romeDay(new Date()) < romeDay(new Date(startsAt));
}

/** Il giorno prima della gara, "gio 12/11" */
function deadlineLabel(startsAt: string) {
  const [y, m, d] = romeDay(new Date(startsAt)).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1, 12)).toLocaleDateString("it-IT", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });
}

function opponents(ev: EventInfo) {
  const names = ev.teams.filter((t) => t.team && !t.team.is_player_school).map((t) => t.team!.name);
  return names.length > 2 ? `${names.length} università` : names.join(", ");
}

const EVENT_SELECT = "id, sport_id, starts_at, status, venue, site, sport:sports(name, icon), teams:sport_event_teams(team:sport_teams(name, is_player_school))";

/* ------------------------------ Giocatore: le mie convocazioni ------------------------------ */

export function MyCallups({ characterId, onRolled }: { characterId: string; onRolled?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<{ event: EventInfo; roll: CallupRoll }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // spinta scelta per ogni gara (normale se non si sceglie)
  const [push, setPush] = useState<Record<string, Push>>({});
  // sport in cui sono capitano e discorsi già fatti
  const [captainOf, setCaptainOf] = useState<Set<string>>(new Set());
  const [morale, setMorale] = useState<Record<string, Morale>>({});

  const load = useCallback(async () => {
    const [{ data }, { data: mine }] = await Promise.all([
      supabase
        .from("sport_callups")
        .select(`roll, event:sport_events(${EVENT_SELECT})`)
        .eq("character_id", characterId)
        .overrideTypes<{ roll: CallupRoll; event: EventInfo | null }[], { merge: false }>(),
      supabase.from("sport_roster").select("sport_id, squad_status").eq("character_id", characterId).is("left_at", null),
    ]);
    const list = (data ?? [])
      .filter((x) => x.event && x.event.status === "scheduled")
      .map((x) => ({ event: x.event!, roll: x.roll }))
      .sort((a, b) => a.event.starts_at.localeCompare(b.event.starts_at));
    setCaptainOf(new Set(((mine ?? []) as { sport_id: string; squad_status: string }[]).filter((r) => r.squad_status === "captain").map((r) => r.sport_id)));
    if (list.length) {
      const { data: mo } = await supabase.from("sport_morale").select("event_id, success, total, cd, auto").in("event_id", list.map((x) => x.event.id));
      setMorale(Object.fromEntries(((mo ?? []) as Morale[]).map((m) => [m.event_id, m])));
    }
    setItems(list);
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function compete(eventId: string) {
    const p = push[eventId] ?? "normal";
    if (p === "max" && !window.confirm("Al massimo: +1 al tiro, ma con un 1 sul dado ti infortuni più facilmente. Lo usi per questa gara?")) return;
    setBusy(eventId);
    setError(null);
    const { error: e } = await supabase.rpc("sport_callup_roll", { p_event: eventId, p_character: characterId, p_push: p });
    setBusy(null);
    if (e) setError(e.message);
    await load();
    onRolled?.();
  }

  async function speech(eventId: string) {
    setBusy(eventId);
    setError(null);
    const { error: e } = await supabase.rpc("sport_captain_speech", { p_event: eventId, p_character: characterId });
    setBusy(null);
    if (e) setError(e.message);
    await load();
  }

  if (!items || items.length === 0) return null;
  return (
    <section className="glass flex flex-col gap-2 rounded-2xl border border-sand/40 p-3">
      <h3 className="flex items-center gap-2 font-heading text-xl tracking-wide text-sand">
        <Megaphone className="size-5" /> Le tue convocazioni
      </h3>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="flex flex-col gap-2">
        {items.map(({ event: ev, roll }) => {
          const open = canStillRoll(ev.starts_at);
          return (
            <li key={ev.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {ev.sport?.icon} {ev.sport?.name} · {opponents(ev)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {eventDate(ev.starts_at)} · {venueText(ev)}
                  {!roll && open && ` · tira entro ${deadlineLabel(ev.starts_at)}`}
                </span>
              </span>
              {roll ? (
                <span className="rounded-full bg-mint/15 px-3 py-1 text-xs text-mint">
                  Tiro fatto: {roll.total} contro {roll.cd}
                  {roll.crit === "success" && " · giocata eccezionale!"}
                  {roll.crit === "failure" && " · errore grave"} · pagella {roll.grade}
                </span>
              ) : open ? (
                <span className="flex flex-wrap items-center gap-2">
                  <PushPicker value={push[ev.id] ?? "normal"} onChange={(p) => setPush({ ...push, [ev.id]: p })} disabled={busy === ev.id} />
                  <Button type="button" size="sm" className="rounded-full" disabled={busy === ev.id} onClick={() => compete(ev.id)}>
                    {busy === ev.id ? <Loader2 className="animate-spin" /> : <Dices />} Gareggia
                  </Button>
                </span>
              ) : (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-muted-foreground">Tempo scaduto: la tua gara verrà simulata</span>
              )}
              <MoraleLine
                morale={morale[ev.id] ?? null}
                captain={captainOf.has(ev.sport_id)}
                open={open}
                busy={busy === ev.id}
                onSpeech={() => speech(ev.id)}
              />
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        «Gareggia» fa il tuo tiro della gara (caratteristica + abilità del ruolo + d10 + modificatori), una volta sola. Prima scegli la spinta: prudente −1 senza infortuni, normale, al massimo +1 con più rischio di infortunio (poche volte a stagione, mai in due gare di fila). Il capitano può fare anche il «Discorso pre-partita»: se riesce, +1 a tutti i personaggi della squadra, anche a chi ha già tirato. Il risultato della squadra arriva quando lo staff
        simula e pubblica la gara.
      </p>
    </section>
  );
}

/** Morale della squadra per una gara: il capitano fa il discorso, gli altri vedono com'è andata */
function MoraleLine({ morale, captain, open, busy, onSpeech }: { morale: Morale | null; captain: boolean; open: boolean; busy: boolean; onSpeech: () => void }) {
  if (morale) {
    return (
      <span className={cn("w-full rounded-lg px-2.5 py-1 text-xs", morale.success ? "bg-sand/15 text-sand" : "bg-white/5 text-muted-foreground")}>
        📢 {captain ? "Il tuo discorso" : "Discorso del capitano"}: {morale.total} contro {morale.cd} ·{" "}
        {morale.success ? "morale alto, +1 a tutta la squadra" : "morale nella norma, niente bonus"}
      </span>
    );
  }
  if (captain && open) {
    return (
      <span className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-sand/10 px-2.5 py-1.5 text-xs">
        <span className="min-w-0 flex-1 text-muted-foreground">
          Sei il capitano: il tuo discorso (CAR + Leadership + d10) può dare +1 a tutta la squadra in questa gara.
        </span>
        <Button type="button" size="xs" variant="secondary" className="rounded-full" disabled={busy} onClick={onSpeech}>
          {busy ? <Loader2 className="animate-spin" /> : <Megaphone />} Discorso pre-partita
        </Button>
      </span>
    );
  }
  return (
    <span className="w-full text-xs text-muted-foreground">
      📢 {captain ? "Discorso non fatto: verrà tirato alla simulazione." : "Il capitano non ha ancora fatto il discorso pre-partita."}
    </span>
  );
}

/* ------------------------------ Amministratore: Convoca ------------------------------ */

type RosterRow = SportRosterEntry & { characters: { name: string } | null };
type CallupRow = { event_id: string; character_id: string; roll: CallupRoll };

export function CallupsTab({ sport }: { sport: Sport }) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<EventInfo[] | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [positions, setPositions] = useState<Record<string, string>>({});
  const [callups, setCallups] = useState<CallupRow[]>([]);
  // sport che sostengono questo a bordo campo: id → "📣 Cheerleading"
  const [support, setSupport] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    // sport che sostengono questo a bordo campo (es. cheerleading per il football)
    const { data: support } = await supabase.from("sports").select("id, name, icon").eq("supports_sport_id", sport.id);
    const supportList = (support ?? []) as { id: string; name: string; icon: string }[];
    const ids = [sport.id, ...supportList.map((x) => x.id)];
    const [e, r, p, c] = await Promise.all([
      supabase.from("sport_events").select(EVENT_SELECT).eq("sport_id", sport.id).eq("status", "scheduled").gte("starts_at", from).order("starts_at").limit(12),
      supabase.from("sport_roster").select("*, characters(name)").in("sport_id", ids).is("left_at", null),
      supabase.from("sport_positions").select("id, name").in("sport_id", ids),
      supabase.from("sport_callups").select("event_id, character_id, roll"),
    ]);
    const evs = (e.data ?? []) as unknown as EventInfo[];
    setEvents(evs);
    setSupport(Object.fromEntries(supportList.map((x) => [x.id, `${x.icon} ${x.name}`])));
    setRoster(
      ((r.data ?? []) as RosterRow[]).sort(
        (a, b) => Number(a.sport_id !== sport.id) - Number(b.sport_id !== sport.id) || (a.characters?.name ?? "").localeCompare(b.characters?.name ?? "", "it"),
      ),
    );
    setPositions(Object.fromEntries(((p.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])));
    setCallups(((c.data ?? []) as CallupRow[]).filter((x) => evs.some((ev) => ev.id === x.event_id)));
  }, [supabase, sport.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  if (!events) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Scegli per ogni gara i personaggi convocati: ricevono un messaggio e, entro il giorno prima, premono «Gareggia» nella pagina Sport. Alla simulazione
        gareggiano solo i convocati (chi non ha tirato viene simulato); senza convocati gareggia tutto il roster come prima. Ogni lunedì e il giorno della gara
        arriva un promemoria agli Amministratori.
        {Object.keys(support).length > 0 && (
          <> Si possono convocare anche gli atleti segnati «a bordo campo» ({Object.values(support).join(", ")}): non gareggiano, ma se tirano bene danno un bonus alla squadra.</>
        )}
      </p>
      {events.length === 0 && <p className="text-sm text-muted-foreground">Nessuna gara in programma per {sport.name}: crea o avvia una stagione in «Stagioni ed eventi».</p>}
      {roster.length === 0 && events.length > 0 && <p className="text-sm text-muted-foreground">Nessun personaggio nel roster di {sport.name}.</p>}
      {roster.length > 0 &&
        events.map((ev) => (
          <EventCallups
            key={ev.id + callups.filter((c) => c.event_id === ev.id).map((c) => c.character_id).join(",")}
            event={ev}
            roster={roster}
            positions={positions}
            support={support}
            callups={callups.filter((c) => c.event_id === ev.id)}
            onSaved={load}
          />
        ))}
    </div>
  );
}

function EventCallups({
  event: ev,
  roster,
  positions,
  support,
  callups,
  onSaved,
}: {
  event: EventInfo;
  roster: RosterRow[];
  positions: Record<string, string>;
  support: Record<string, string>;
  callups: CallupRow[];
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(callups.map((c) => c.character_id)));
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: string | null }>({ busy: false, error: null, done: null });
  const changed = picked.size !== callups.length || callups.some((c) => !picked.has(c.character_id));

  async function save() {
    setState({ busy: true, error: null, done: null });
    const { data, error: e } = await supabase.rpc("sport_callup_set", { p_event: ev.id, p_characters: [...picked] });
    setState({ busy: false, error: e?.message ?? null, done: e ? null : `Convocati salvati${data ? ` · ${data} avvisati` : ""}.` });
    if (!e) onSaved();
  }

  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">
          {ev.sport?.icon} {opponents(ev)}
        </span>
        <span className="text-xs text-muted-foreground">
          {eventDate(ev.starts_at)} · {venueText(ev)} · «Gareggia» fino al {deadlineLabel(ev.starts_at)}
        </span>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {roster.map((r) => {
          const callup = callups.find((c) => c.character_id === r.character_id);
          return (
            <li key={r.id}>
              <label className={cn("flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5", picked.has(r.character_id) && "bg-flamingo/10")}>
                <input
                  type="checkbox"
                  checked={picked.has(r.character_id)}
                  onChange={(e) =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(r.character_id);
                      else n.delete(r.character_id);
                      return n;
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate">{r.characters?.name ?? "?"}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {(r.position_id && positions[r.position_id]) || "senza ruolo"} · {SQUAD_LABEL[r.squad_status]}
                  {r.injury_events_left > 0 && " · 🩹"}
                  {support[r.sport_id] && ` · ${support[r.sport_id]} a bordo campo`}
                </span>
                {callup && (
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.65rem]", callup.roll ? "bg-mint/15 text-mint" : "bg-white/10 text-muted-foreground")}>
                    {callup.roll ? `tirato · ${callup.roll.grade}` : "da tirare"}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={!changed || state.busy} onClick={save}>
          <Save /> Salva convocati ({picked.size})
        </Button>
        {state.done && <span className="text-xs text-mint">{state.done}</span>}
        {state.error && <span className="text-xs text-destructive">{state.error}</span>}
      </div>
    </section>
  );
}
