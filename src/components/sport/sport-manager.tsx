"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { inputClass, textareaClass } from "@/components/admin/admin-ui";
import { CallupsTab } from "@/components/sport/callups";
import { SportIcon } from "@/components/sport/sport-icon";
import { Button } from "@/components/ui/button";
import { firstName } from "@/lib/format";
import {
  EVENT_KINDS,
  EVENT_STATUS_LABEL,
  FORMAT_LABEL,
  PHASE_LABEL,
  SEASON_LABEL,
  SQUAD_LABEL,
  VENUE_LABEL,
  dieValue,
  rollAverage,
  rollsText,
  type RollPart,
  eventDate,
  trainingFormula,
} from "@/lib/sport";
import { createClient } from "@/lib/supabase/client";
import type {
  Sport,
  SportAward,
  SportEvent,
  SportEventTeam,
  SportFormat,
  SportPosition,
  SportPositionCombo,
  SportRosterEntry,
  SportSeason,
  SportSeasonKind,
  SportTeam,
  SportTeamRating,
  SportTraining,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// Gestione → Sport (permesso sport.gestire): stagioni ed eventi, roster, catalogo degli sport,
// università rivali e rating, premi. Le scritture passano dalle policy e dalle funzioni sport_*.

type Lookup = {
  sports: Sport[];
  positions: SportPosition[];
  combos: SportPositionCombo[];
  teams: SportTeam[];
  ratings: SportTeamRating[];
  attrs: { id: string; code: string; name: string }[];
  skills: { id: string; name: string }[];
};
type Tab = "eventi" | "convoca" | "roster" | "allenamenti" | "sport" | "squadre" | "premi";
const TABS: [Tab, string][] = [
  ["eventi", "Stagioni ed eventi"],
  ["convoca", "Convoca"],
  ["roster", "Roster"],
  ["allenamenti", "Allenamenti"],
  ["sport", "Sport e ruoli"],
  ["squadre", "Università e rating"],
  ["premi", "Premi"],
];

/** "2026-10-30T21:00" in ora italiana → ISO */
function fromLocalInput(v: string) {
  const guess = new Date(`${v}:00Z`);
  const rome = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (rome.getTime() - utc.getTime())).toISOString();
}

function useAct(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = useCallback(
    async (run: () => PromiseLike<{ error: { message: string } | null }>) => {
      setBusy(true);
      setError(null);
      const { error: e } = await run();
      setBusy(false);
      if (e) setError(e.message);
      onDone();
      return !e;
    },
    [onDone],
  );
  return { error, busy, act };
}

export function SportManager({ isAdmin = false }: { isAdmin?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("eventi");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [sportId, setSportId] = useState("");

  const load = useCallback(async () => {
    const [s, p, c, t, r, a, k] = await Promise.all([
      supabase.from("sports").select("*").order("sort_order").order("name"),
      supabase.from("sport_positions").select("*").order("sort_order"),
      supabase.from("sport_position_combos").select("*").order("sort_order"),
      supabase.from("sport_teams").select("*").order("is_player_school", { ascending: false }).order("name"),
      supabase.from("sport_team_ratings").select("*"),
      supabase.from("attributes").select("id, code, name").eq("active", true).order("sort_order"),
      supabase.from("skills").select("id, name").eq("active", true).order("name"),
    ]);
    const sports = (s.data ?? []) as Sport[];
    setLookup({
      sports,
      positions: (p.data ?? []) as SportPosition[],
      combos: (c.data ?? []) as SportPositionCombo[],
      teams: (t.data ?? []) as SportTeam[],
      ratings: (r.data ?? []) as SportTeamRating[],
      attrs: (a.data ?? []) as Lookup["attrs"],
      skills: (k.data ?? []) as Lookup["skills"],
    });
    setSportId((cur) => cur || sports[0]?.id || "");
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  if (!lookup) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const sport = lookup.sports.find((s) => s.id === sportId) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex flex-wrap gap-1 rounded-2xl bg-white/5 p-1">
        {TABS.filter(([k]) => k !== "convoca" || isAdmin).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("rounded-full px-3 py-1.5 text-xs", tab === k ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
          >
            {label}
          </button>
        ))}
      </nav>
      {(tab === "eventi" || tab === "convoca" || tab === "roster" || tab === "allenamenti" || tab === "premi") && (
        <select className={cn(inputClass, "w-64")} value={sportId} onChange={(e) => setSportId(e.target.value)}>
          {lookup.sports.map((s) => (
            <option key={s.id} value={s.id}>
              <SportIcon sport={s} /> {s.name}
              {s.status === "archived" ? " (archiviato)" : ""}
            </option>
          ))}
        </select>
      )}
      {tab === "eventi" && sport && <EventsTab key={sport.id} sport={sport} lookup={lookup} />}
      {tab === "convoca" && isAdmin && sport && <CallupsTab key={sport.id} sport={sport} />}
      {tab === "roster" && sport && <RosterTab key={sport.id} sport={sport} lookup={lookup} />}
      {tab === "allenamenti" && sport && <TrainingsTab key={sport.id} sport={sport} lookup={lookup} />}
      {tab === "sport" && <SportsTab lookup={lookup} reload={load} />}
      {tab === "squadre" && <TeamsTab lookup={lookup} reload={load} />}
      {tab === "premi" && sport && <AwardsTab key={sport.id} sport={sport} />}
    </div>
  );
}

/* ------------------------------ Stagioni ed eventi ------------------------------ */

type RollRow = {
  id: number;
  character_id: string;
  d10: number;
  crit_type: string;
  extra_d10: number | null;
  total: number;
  cd: number;
  margin: number;
  grade: number;
  contribution: number;
  highlight: boolean;
  injury: { events: number } | null;
  modifiers: { voci?: { name: string; value: number }[]; totale?: number; ruolo?: string; tiri?: RollPart[]; morale?: number };
  characters: { name: string } | null;
};

function EventsTab({ sport, lookup }: { sport: Sport; lookup: Lookup }) {
  const supabase = useMemo(() => createClient(), []);
  const [seasons, setSeasons] = useState<SportSeason[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [teams, setTeams] = useState<SportEventTeam[]>([]);
  const [label, setLabel] = useState("");
  const [gen, setGen] = useState({ start: "", days: 7 });
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await supabase.from("sport_seasons").select("*").eq("sport_id", sport.id).order("created_at", { ascending: false });
    const list = (s.data ?? []) as SportSeason[];
    setSeasons(list);
    const sid = seasonId && list.some((x) => x.id === seasonId) ? seasonId : (list.find((x) => x.status !== "closed") ?? list[0])?.id ?? "";
    setSeasonId(sid);
    if (!sid) return setEvents([]);
    const e = await supabase.from("sport_events").select("*").eq("season_id", sid).order("starts_at");
    const evs = (e.data ?? []) as SportEvent[];
    setEvents(evs);
    const t = evs.length ? await supabase.from("sport_event_teams").select("*").in("event_id", evs.map((x) => x.id)) : { data: [] };
    setTeams((t.data ?? []) as SportEventTeam[]);
  }, [supabase, sport.id, seasonId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura della stagione
    load();
  }, [load]);
  const { error, busy, act } = useAct(load);

  const season = seasons.find((s) => s.id === seasonId) ?? null;
  const teamName = (id: string) => lookup.teams.find((t) => t.id === id)?.name ?? "—";
  const school = lookup.teams.find((t) => t.is_player_school);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {SEASON_LABEL[sport.season]} · {FORMAT_LABEL[sport.format]}. In preparazione i giocatori non vedono il calendario e non ricevono avvisi: attiva la stagione quando è pronta.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select className={cn(inputClass, "w-56")} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          {seasons.length === 0 && <option value="">Nessuna stagione</option>}
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} · {s.status === "planning" ? "in preparazione" : s.status === "active" ? "in corso" : "chiusa"}
            </option>
          ))}
        </select>
        <input className={cn(inputClass, "w-28")} value={label} placeholder="2026-27" onChange={(e) => setLabel(e.target.value)} />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy || label.trim().length < 2}
          onClick={() => act(() => supabase.from("sport_seasons").insert({ sport_id: sport.id, label: label.trim() })).then(() => setLabel(""))}
        >
          <Plus /> Nuova stagione
        </Button>
        {season?.status === "planning" && (
          <Button type="button" size="sm" disabled={busy} onClick={() => act(() => supabase.from("sport_seasons").update({ status: "active" }).eq("id", season.id))}>
            Attiva la stagione
          </Button>
        )}
        {season?.status === "active" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => window.confirm("Chiudere la stagione? Si assegnano i premi e si contano le stagioni di eleggibilità.") && act(() => supabase.rpc("sport_season_close", { p_season: season.id }))}
          >
            Chiudi la stagione e assegna i premi
          </Button>
        )}
      </div>

      {season && season.status !== "closed" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-2 text-xs">
          Calendario automatico contro la Conference: dal
          <input type="datetime-local" className={cn(inputClass, "h-8 w-48")} value={gen.start} onChange={(e) => setGen({ ...gen, start: e.target.value })} />
          ogni
          <input type="number" min={1} max={30} className={cn(inputClass, "h-8 w-16")} value={gen.days} onChange={(e) => setGen({ ...gen, days: Number(e.target.value) })} />
          giorni
          <Button
            type="button"
            size="xs"
            disabled={busy || !gen.start}
            onClick={() => act(() => supabase.rpc("sport_season_generate", { p_season: season.id, p_start: fromLocalInput(gen.start), p_days: gen.days }))}
          >
            Genera
          </Button>
          <Button type="button" size="xs" variant="ghost" onClick={() => setAdding(true)}>
            <Plus /> Evento singolo
          </Button>
        </div>
      )}
      {adding && season && <EventForm sport={sport} season={season} lookup={lookup} onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />}

      <ul className="flex flex-col gap-1.5">
        {events.map((e) => {
          const et = teams.filter((t) => t.event_id === e.id);
          return (
            <li key={e.id} className={cn("glass rounded-xl p-2.5 text-sm", e.status === "cancelled" && "opacity-50")}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <button type="button" className="text-left font-medium hover:underline" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  {eventDate(e.starts_at)} · {et.filter((t) => t.team_id !== school?.id).map((t) => teamName(t.team_id)).join(", ") || "senza avversari"}
                </button>
                <span className="text-xs text-muted-foreground">
                  {e.kind} · {VENUE_LABEL[e.venue]} · {PHASE_LABEL[e.phase]} · {e.mode === "simulated" ? "simulato" : "giocato in chat"}
                </span>
                <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[0.7rem]", e.status === "published" ? "bg-mint/20" : e.status === "simulated" ? "bg-peach/25" : "bg-white/10")}>
                  {EVENT_STATUS_LABEL[e.status]}
                </span>
              </div>
              {(e.status === "simulated" || e.status === "published") && (
                <p className="mt-1 text-xs">
                  {et.map((t) => `${teamName(t.team_id)} ${t.score ?? ""}${t.placement ? ` (${t.placement}°)` : ""}${t.time_or_measure ? ` ${t.time_or_measure}` : ""}`).join(" · ")}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(e.status === "scheduled" || e.status === "postponed") && e.mode === "simulated" && (
                  <Button type="button" size="xs" disabled={busy} onClick={() => act(() => supabase.rpc("sport_event_simulate", { p_event: e.id }))}>
                    Simula
                  </Button>
                )}
                {e.status === "simulated" && (
                  <>
                    <Button type="button" size="xs" disabled={busy} onClick={() => act(() => supabase.rpc("sport_event_publish", { p_event: e.id }))}>
                      Pubblica
                    </Button>
                    <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => act(() => supabase.rpc("sport_event_reset", { p_event: e.id }))}>
                      Annulla la simulazione
                    </Button>
                  </>
                )}
                {(e.status === "scheduled" || e.status === "postponed") && (
                  <>
                    <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(e.id)}>
                      {e.mode === "played_in_chat" ? "Inserisci risultato" : "Dettagli e bonus"}
                    </Button>
                    {e.status === "scheduled" && (
                      <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => act(() => supabase.from("sport_events").update({ status: "postponed" }).eq("id", e.id))}>
                        Rinvia
                      </Button>
                    )}
                    {e.status === "postponed" && (
                      <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => act(() => supabase.from("sport_events").update({ status: "scheduled" }).eq("id", e.id))}>
                        Rimetti in programma
                      </Button>
                    )}
                    <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => act(() => supabase.from("sport_events").update({ status: "cancelled" }).eq("id", e.id))}>
                      Annulla l&apos;evento
                    </Button>
                  </>
                )}
                {e.status !== "published" && e.status !== "simulated" && (
                  <Button type="button" size="icon-xs" variant="ghost" aria-label="Elimina" disabled={busy} onClick={() => window.confirm("Eliminare l'evento?") && act(() => supabase.from("sport_events").delete().eq("id", e.id))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
              {open === e.id && <EventDetail event={e} sport={sport} teams={et} lookup={lookup} onChange={load} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EventForm({ sport, season, lookup, onDone, onCancel }: { sport: Sport; season: SportSeason; lookup: Lookup; onDone: () => void; onCancel: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const race = sport.format.endsWith("race");
  const rivals = lookup.teams.filter((t) => !t.is_player_school && t.active && lookup.ratings.some((r) => r.team_id === t.id && r.sport_id === sport.id));
  const [f, setF] = useState({
    starts: "",
    kind: (race ? (sport.format === "team_race" ? "regata" : "meeting") : sport.format === "team_match" ? "partita" : "incontro") as SportEvent["kind"],
    phase: "regular" as SportEvent["phase"],
    venue: "home" as SportEvent["venue"],
    mode: "simulated" as SportEvent["mode"],
    notes: "",
    opponents: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const school = lookup.teams.find((t) => t.is_player_school);
    const { data, error: e } = await supabase
      .from("sport_events")
      .insert({ season_id: season.id, sport_id: sport.id, kind: f.kind, phase: f.phase, venue: f.venue, mode: f.mode, notes: f.notes.trim(), starts_at: fromLocalInput(f.starts) })
      .select("id")
      .single<{ id: string }>();
    if (e || !data) return setError(e?.message ?? "Errore");
    const rows = [...(school ? [school.id] : []), ...f.opponents].map((team_id) => ({ event_id: data.id, team_id }));
    const { error: e2 } = await supabase.from("sport_event_teams").insert(rows);
    if (e2) return setError(e2.message);
    onDone();
  }

  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        <input type="datetime-local" className={inputClass} value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} aria-label="Data e ora (ora italiana)" />
        <select className={inputClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as SportEvent["kind"] })}>
          {EVENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select className={inputClass} value={f.phase} onChange={(e) => setF({ ...f, phase: e.target.value as SportEvent["phase"] })}>
          {(Object.keys(PHASE_LABEL) as SportEvent["phase"][]).map((k) => (
            <option key={k} value={k}>
              {PHASE_LABEL[k]}
            </option>
          ))}
        </select>
        <select className={inputClass} value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value as SportEvent["venue"] })}>
          {(Object.keys(VENUE_LABEL) as SportEvent["venue"][]).map((k) => (
            <option key={k} value={k}>
              {VENUE_LABEL[k]}
            </option>
          ))}
        </select>
        <select className={inputClass} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as SportEvent["mode"] })}>
          <option value="simulated">Simulato dai dadi</option>
          <option value="played_in_chat">Giocato in chat (risultato a mano)</option>
        </select>
        <input className={inputClass} value={f.notes} maxLength={500} placeholder="Note (derby, beneficenza…)" onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-1 text-xs">
        <span className="text-muted-foreground">{race ? "Squadre in gara:" : "Avversario:"}</span>
        {[...rivals, ...lookup.teams.filter((t) => t.is_national && !rivals.includes(t))].map((t) => {
          const on = f.opponents.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setF({ ...f, opponents: race ? (on ? f.opponents.filter((x) => x !== t.id) : [...f.opponents, t.id]) : on ? [] : [t.id] })}
              className={cn("rounded-full border px-2 py-0.5", on ? "border-flamingo bg-flamingo/20" : "border-white/10")}
            >
              {t.name}
              {t.is_national ? " (nazionale)" : ""}
            </button>
          );
        })}
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!f.starts || f.opponents.length === 0} onClick={save}>
          Aggiungi
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </div>
  );
}

function EventDetail({ event, sport, teams, lookup, onChange }: { event: SportEvent; sport: Sport; teams: SportEventTeam[]; lookup: Lookup; onChange: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [rolls, setRolls] = useState<RollRow[]>([]);
  const [athletes, setAthletes] = useState<{ character_id: string; name: string }[]>([]);
  const [mods, setMods] = useState(event.master_mods);
  const [result, setResult] = useState<Record<string, { score: string; placement: string; time: string }>>({});
  const [recap, setRecap] = useState("");
  const { error, busy, act } = useAct(onChange);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from("sport_event_rolls").select("*, characters(name)").eq("event_id", event.id).order("grade", { ascending: false }),
      supabase.from("sport_roster").select("character_id, characters(name)").eq("sport_id", sport.id).is("left_at", null),
    ]).then(([r, a]) => {
      if (!alive) return;
      setRolls((r.data ?? []) as RollRow[]);
      setAthletes(((a.data ?? []) as unknown as { character_id: string; characters: { name: string } | null }[]).map((x) => ({ character_id: x.character_id, name: x.characters?.name ?? "" })));
    });
    return () => {
      alive = false;
    };
  }, [supabase, event.id, sport.id]);

  const editable = event.status === "scheduled" || event.status === "postponed";
  const teamName = (id: string) => lookup.teams.find((t) => t.id === id)?.name ?? "—";
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-2 text-xs">
      {error && <p className="text-destructive">{error}</p>}
      {event.recap_text && <p className="rounded-lg bg-white/5 p-2 whitespace-pre-line">{event.recap_text}</p>}
      {rolls.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {rolls.map((r) => (
            <li key={r.id}>
              <strong>{firstName(r.characters?.name ?? "")}</strong> ({r.modifiers.ruolo}):{" "}
              {(r.modifiers.tiri ?? []).length > 1 ? (
                <>{rollsText(r.modifiers.tiri ?? [])}</>
              ) : (
                <>
                  d10 {r.d10}
                  {r.extra_d10 !== null && ` [${r.crit_type === "success" ? "+" : "−"}${r.extra_d10}]`} + mod {r.modifiers.totale ?? 0} = {r.total - (r.modifiers.morale ?? 0)}
                </>
              )}
              {r.modifiers.morale ? ` + ${r.modifiers.morale} morale = ${r.total}` : ""}{" "}
              vs CD {r.cd} · voto {r.grade} · contributo {r.contribution > 0 ? "+" : ""}
              {r.contribution}
              {r.highlight && " · ⭐"}
              {r.injury && ` · 🩹 ${r.injury.events >= 999 ? "fine stagione" : `${r.injury.events} eventi`}`}
              {(r.modifiers.voci ?? []).length > 0 && <span className="text-muted-foreground"> · {(r.modifiers.voci ?? []).map((v) => `${v.name} ${v.value > 0 ? "+" : ""}${v.value}`).join(", ")}</span>}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">Bonus/malus del Master per questo evento (da −3 a +3, con nota):</p>
          {athletes.map((a) => (
            <div key={a.character_id} className="flex items-center gap-1.5">
              <span className="w-28 truncate">{firstName(a.name)}</span>
              <input
                type="number"
                min={-3}
                max={3}
                className={cn(inputClass, "h-7 w-16")}
                value={mods[a.character_id]?.value ?? 0}
                onChange={(e) => setMods({ ...mods, [a.character_id]: { ...mods[a.character_id], value: Math.max(-3, Math.min(3, Number(e.target.value))) } })}
              />
              <input
                className={cn(inputClass, "h-7 flex-1")}
                maxLength={100}
                placeholder="nota"
                value={mods[a.character_id]?.note ?? ""}
                onChange={(e) => setMods({ ...mods, [a.character_id]: { value: mods[a.character_id]?.value ?? 0, note: e.target.value } })}
              />
            </div>
          ))}
          <Button type="button" size="xs" className="self-start" disabled={busy} onClick={() => act(() => supabase.from("sport_events").update({ master_mods: mods }).eq("id", event.id))}>
            Salva i bonus
          </Button>
        </div>
      )}
      {editable && event.mode === "played_in_chat" && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">Risultato della giocata:</p>
          {teams.map((t) => (
            <div key={t.team_id} className="flex flex-wrap items-center gap-1.5">
              <span className="w-44 truncate">{teamName(t.team_id)}</span>
              <input className={cn(inputClass, "h-7 w-20")} placeholder="punti" value={result[t.team_id]?.score ?? ""} onChange={(e) => setResult({ ...result, [t.team_id]: { ...{ score: "", placement: "", time: "" }, ...result[t.team_id], score: e.target.value } })} />
              <input className={cn(inputClass, "h-7 w-20")} placeholder="posto" value={result[t.team_id]?.placement ?? ""} onChange={(e) => setResult({ ...result, [t.team_id]: { ...{ score: "", placement: "", time: "" }, ...result[t.team_id], placement: e.target.value } })} />
              {sport.format.endsWith("race") && (
                <input className={cn(inputClass, "h-7 w-24")} placeholder="tempo" value={result[t.team_id]?.time ?? ""} onChange={(e) => setResult({ ...result, [t.team_id]: { ...{ score: "", placement: "", time: "" }, ...result[t.team_id], time: e.target.value } })} />
              )}
            </div>
          ))}
          <textarea className={textareaClass} maxLength={3000} placeholder="Resoconto per la chat" value={recap} onChange={(e) => setRecap(e.target.value)} />
          <Button
            type="button"
            size="xs"
            className="self-start"
            disabled={busy}
            onClick={() =>
              act(() =>
                supabase.rpc("sport_event_result", {
                  p_event: event.id,
                  p_recap: recap,
                  p_teams: teams.map((t) => ({
                    team_id: t.team_id,
                    score: result[t.team_id]?.score ? Number(result[t.team_id].score) : null,
                    placement: result[t.team_id]?.placement ? Number(result[t.team_id].placement) : null,
                    time: result[t.team_id]?.time ?? "",
                  })),
                }),
              )
            }
          >
            Salva il risultato
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Roster ------------------------------ */

type RosterRow = SportRosterEntry & { characters: { name: string } | null };

function RosterTab({ sport, lookup }: { sport: Sport; lookup: Lookup }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("sport_roster").select("*, characters(name)").eq("sport_id", sport.id).is("left_at", null).order("joined_at");
    setRows((data ?? []) as RosterRow[]);
  }, [supabase, sport.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura del roster
    load();
  }, [load]);
  const { error, busy, act } = useAct(load);
  const positions = lookup.positions.filter((p) => p.sport_id === sport.id);
  const update = (id: number, patch: Partial<SportRosterEntry>) => act(() => supabase.from("sport_roster").update(patch).eq("id", id));

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nessun atleta. I giocatori entrano da soli dalla pagina Sport.</p>}
      {rows.map((r) => (
        <div key={r.id} className="glass flex flex-col gap-1.5 rounded-xl p-2.5 text-xs">
          <p className="text-sm font-medium">{r.characters?.name}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <select className={cn(inputClass, "h-7 w-36")} value={r.position_id ?? ""} disabled={busy} onChange={(e) => update(r.id, { position_id: e.target.value || null })}>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select className={cn(inputClass, "h-7 w-28")} value={r.squad_status} disabled={busy} onChange={(e) => update(r.id, { squad_status: e.target.value as SportRosterEntry["squad_status"] })}>
              {(Object.keys(SQUAD_LABEL) as SportRosterEntry["squad_status"][]).map((k) => (
                <option key={k} value={k}>
                  {SQUAD_LABEL[k]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={r.scholarship} disabled={busy} onChange={(e) => update(r.id, { scholarship: e.target.checked })} /> Borsa
            </label>
            <label className="flex items-center gap-1">
              Allenamenti in chat
              <select className={cn(inputClass, "h-7 w-14")} value={r.training_bonus} disabled={busy} onChange={(e) => update(r.id, { training_bonus: Number(e.target.value) })}>
                {[0, 1, 2].map((n) => (
                  <option key={n} value={n}>
                    +{n}
                  </option>
                ))}
              </select>
            </label>
            <select className={cn(inputClass, "h-7 w-36")} value={r.eligibility_override} disabled={busy} onChange={(e) => update(r.id, { eligibility_override: e.target.value as SportRosterEntry["eligibility_override"] })}>
              <option value="auto">Eleggibilità automatica</option>
              <option value="eligible">Forza eleggibile</option>
              <option value="ineligible">Forza ineleggibile</option>
            </select>
            <label className="flex items-center gap-1">
              Infortunio (eventi)
              <input
                type="number"
                min={0}
                className={cn(inputClass, "h-7 w-16")}
                defaultValue={r.injury_events_left >= 999 ? 999 : r.injury_events_left}
                onBlur={(e) => Number(e.target.value) !== r.injury_events_left && update(r.id, { injury_events_left: Math.max(0, Number(e.target.value)) })}
              />
            </label>
          </div>
          {r.pending_position_id && (
            <p className="flex flex-wrap items-center gap-2 text-peach">
              Chiede di passare a {r.pending_sport_id ? lookup.sports.find((s) => s.id === r.pending_sport_id)?.name : sport.name} ·{" "}
              {lookup.positions.find((p) => p.id === r.pending_position_id)?.name}
              <Button type="button" size="xs" disabled={busy} onClick={() => act(() => supabase.rpc("sport_change_review", { p_roster: r.id, p_approve: true }))}>
                Approva
              </Button>
              <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => act(() => supabase.rpc("sport_change_review", { p_roster: r.id, p_approve: false }))}>
                Rifiuta
              </Button>
            </p>
          )}
        </div>
      ))}
      <p className="text-[0.7rem] text-muted-foreground">999 eventi = fuori fino a fine stagione. Un solo capitano per squadra.</p>
    </div>
  );
}

/* ------------------------------ Allenamenti ------------------------------ */

type TrainingRow = SportTraining & { characters: { name: string } | null; sports: { name: string } | null };
type TrainingMods = {
  caratteristica?: number;
  codice?: string;
  abilita?: number;
  abilita_nome?: string;
  ruolo?: string;
  voci?: { name: string; value: number }[] | null;
  voci_totale?: number;
  intensita?: "light" | "normal" | "intense";
  intensita_valore?: number;
  totale?: number;
  cd_base?: number;
  trainer?: number;
  spinta?: "prudent" | "normal" | "max";
  spinta_valore?: number;
  tiri?: RollPart[];
  infortunio?: boolean;
};

/** Allenamenti di tutti gli atleti con il conto per intero e il controllo che torni */
function TrainingsTab({ sport, lookup }: { sport: Sport; lookup: Lookup }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<TrainingRow[] | null>(null);
  const [onlySport, setOnlySport] = useState(false);
  const [days, setDays] = useState(30);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    let q = supabase
      .from("sport_trainings")
      .select("*, characters(name), sports(name)")
      .gte("created_at", new Date(now - days * 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    if (onlySport) q = q.eq("sport_id", sport.id);
    q.then(({ data }) => alive && setRows((data ?? []) as TrainingRow[]));
    return () => {
      alive = false;
    };
  }, [supabase, sport.id, onlySport, days, now]);

  // per gli allenamenti vecchi (salvati senza codice e nome dell'abilità) si risale dal ruolo
  function partsOf(t: TrainingRow) {
    const m = t.modifiers as TrainingMods;
    const pos = lookup.positions.find((p) => p.sport_id === t.sport_id && p.name === m.ruolo);
    return {
      code: m.codice ?? lookup.attrs.find((a) => a.id === pos?.attribute_id)?.code ?? null,
      attr: m.caratteristica ?? null,
      skillName: m.abilita_nome ?? lookup.skills.find((s) => s.id === pos?.skill_id)?.name ?? null,
      skill: m.abilita ?? null,
      d10: t.d10,
      crit: t.crit,
      extra: t.extra,
      mods: m.totale ?? 0,
    };
  }

  // il totale ricalcolato dai pezzi: un tiro, o la media di due
  function computedOf(t: TrainingRow) {
    const tiri = (t.modifiers as TrainingMods).tiri ?? [];
    const one = (p: { attr?: number | null; skill?: number | null; d10: number; crit: string; extra: number | null; mods?: number | null }) =>
      (p.attr ?? 0) + (p.skill ?? 0) + dieValue(p) + (p.mods ?? 0);
    if (tiri.length > 1) {
      const [a, b] = tiri.map((x) => one({ attr: x.caratteristica, skill: x.abilita, d10: x.d10, crit: x.crit, extra: x.extra, mods: x.mods }));
      return rollAverage(a, b);
    }
    return one(partsOf(t));
  }

  if (!rows) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const wrong = rows.filter((t) => computedOf(t) !== t.total).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlySport} onChange={(e) => setOnlySport(e.target.checked)} /> Solo {sport.name}
        </label>
        <label className="flex items-center gap-1.5">
          Ultimi
          <select className={cn(inputClass, "h-7 w-24")} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 30, 90, 365].map((d) => (
              <option key={d} value={d}>
                {d} giorni
              </option>
            ))}
          </select>
        </label>
        <span className={cn("ml-auto rounded-full px-2 py-0.5", wrong ? "bg-destructive/20 text-destructive" : "bg-mint/15 text-mint")}>
          {rows.length} allenamenti · {wrong ? `${wrong} con il conto che non torna` : "tutti i conti tornano"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Caratteristica + abilità del ruolo + d10 (10 → si aggiunge un secondo d10, 1 → lo si toglie) + modificatori (intensità, voci, malus) contro la CD (14, −2 con il personal trainer). I ruoli con due tiri usano la media dei due.
        Riuscito = +1 ai tiri sportivi per due settimane.
      </p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nessun allenamento nel periodo.</p>}
      <ul className="flex flex-col gap-1.5">
        {rows.map((t) => {
          const m = t.modifiers as TrainingMods;
          const p = partsOf(t);
          const computed = computedOf(t);
          const voci = (m.voci ?? []).filter((v) => v.value !== 0);
          const intensity = m.intensita_valore ?? (m.totale ?? 0) - (m.voci_totale ?? voci.reduce((s, v) => s + v.value, 0));
          return (
            <li key={t.id} className={cn("glass flex flex-col gap-1 rounded-xl px-3 py-2 text-sm", computed !== t.total && "border border-destructive/50")}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs text-muted-foreground">{eventDate(t.created_at)}</span>
                <span className="font-medium">{t.characters?.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t.sports?.name} · {m.ruolo ?? "—"}
                </span>
                <span className={cn("ml-auto text-xs font-semibold", t.success ? "text-mint" : "text-destructive")}>
                  {t.success ? "riuscito" : "non riuscito"} · {t.total} contro {t.cd}
                </span>
              </div>
              <p className="font-mono text-xs">
                {(m.tiri ?? []).length > 1 ? rollsText(m.tiri ?? []) : trainingFormula(p)} contro CD {t.cd}
                {m.trainer ? ` (${m.cd_base ?? t.cd + m.trainer} − ${m.trainer} personal trainer)` : ""}
              </p>
              <p className="text-[0.7rem] text-muted-foreground">
                Modificatori: intensità {m.intensita === "light" ? "leggera" : m.intensita === "intense" ? "intensa" : "normale"} ({intensity > 0 ? "+" : ""}
                {intensity})
                {m.spinta && m.spinta !== "normal" && ` · spinta ${m.spinta === "max" ? "al massimo (+1)" : "prudente (−1)"}`}
                {voci.length > 0 && ` · ${voci.map((v) => `${v.name} ${v.value > 0 ? "+" : ""}${v.value}`).join(" · ")}`}
                {t.crit === "failure" && " · fallimento critico (1 sul d10)"}
                {m.infortunio && " · infortunio in allenamento"}
                {t.crit === "success" && " · successo critico (10 sul d10)"}
              </p>
              {computed !== t.total && <p className="text-xs text-destructive">⚠ Il conto non torna: i pezzi fanno {computed}, il tiro salvato è {t.total}.</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------ Sport e ruoli ------------------------------ */

function SportsTab({ lookup, reload }: { lookup: Lookup; reload: () => void }) {
  const [editing, setEditing] = useState<Sport | "new" | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" className="self-start rounded-full" onClick={() => setEditing("new")}>
        <Plus /> Nuovo sport
      </Button>
      {editing && <SportForm key={editing === "new" ? "new" : editing.id} sport={editing === "new" ? null : editing} lookup={lookup} onDone={() => { setEditing(null); reload(); }} />}
      <ul className="flex flex-col gap-1">
        {lookup.sports.map((s) => (
          <li key={s.id} className="flex flex-wrap items-baseline gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-sm">
            <button type="button" className="font-medium hover:underline" onClick={() => setEditing(s)}>
              <SportIcon sport={s} /> {s.name}
            </button>
            <span className="text-xs text-muted-foreground">
              {SEASON_LABEL[s.season]} · {FORMAT_LABEL[s.format]} · {lookup.positions.filter((p) => p.sport_id === s.id).length} ruoli
              {s.status === "archived" && " · archiviato"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SportForm({ sport, lookup, onDone }: { sport: Sport | null; lookup: Lookup; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({
    name: sport?.name ?? "",
    description: sport?.description ?? "",
    season: sport?.season ?? ("fall" as SportSeasonKind),
    format: sport?.format ?? ("team_match" as SportFormat),
    allows_draw: sport?.allows_draw ?? false,
    icon: sport?.icon ?? "🏅",
    icon_url: sport?.icon_url ?? "",
    color: sport?.color ?? "",
    profile: JSON.stringify(sport?.score_profile ?? { kind: "points", base: 10, per: 1, jitter: 2 }),
    status: sport?.status ?? "active",
  });
  const [error, setError] = useState<string | null>(null);
  const positions = lookup.positions.filter((p) => p.sport_id === sport?.id);
  const [pos, setPos] = useState({ name: "", attribute_id: lookup.attrs[0]?.id ?? "", skill_id: "", max_slots: "", team_bonus: false });

  async function save() {
    setError(null);
    let profile: unknown;
    try {
      profile = JSON.parse(f.profile);
    } catch {
      return setError("Il profilo del punteggio non è un JSON valido.");
    }
    const iconUrl = f.icon_url.trim();
    if (iconUrl && !iconUrl.startsWith("https://")) return setError("Il link dell'icona deve iniziare con https://");
    const row = { name: f.name.trim(), description: f.description.trim(), season: f.season, format: f.format, allows_draw: f.allows_draw, icon: f.icon, icon_url: iconUrl || null, color: f.color, score_profile: profile, status: f.status };
    const { error: e } = sport ? await supabase.from("sports").update(row).eq("id", sport.id) : await supabase.from("sports").insert(row);
    if (e) return setError(e.message);
    onDone();
  }
  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error: e } = await p;
    if (e) setError(e.message);
    else onDone();
  }

  return (
    <div className="glass flex flex-col gap-2 rounded-2xl p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-4">
        <input className={inputClass} value={f.name} maxLength={60} placeholder="Nome" onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={inputClass} value={f.icon} maxLength={8} placeholder="Emoji (es. 🏈)" title="Emoji per menu a tendina e resoconti" onChange={(e) => setF({ ...f, icon: e.target.value })} />
        <select className={inputClass} value={f.season} onChange={(e) => setF({ ...f, season: e.target.value as SportSeasonKind })}>
          {(Object.keys(SEASON_LABEL) as SportSeasonKind[]).map((k) => (
            <option key={k} value={k}>
              {SEASON_LABEL[k]}
            </option>
          ))}
        </select>
        <select className={inputClass} value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as SportFormat })}>
          {(Object.keys(FORMAT_LABEL) as SportFormat[]).map((k) => (
            <option key={k} value={k}>
              {FORMAT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-xs">
        Link icona (immagine https, 30×30)
        <input className={cn(inputClass, "min-w-0 flex-1")} type="url" value={f.icon_url} maxLength={500} placeholder="https://…" onChange={(e) => setF({ ...f, icon_url: e.target.value })} />
        <SportIcon sport={{ icon: f.icon, icon_url: f.icon_url.trim() || null }} />
        <span className="w-full text-muted-foreground">Si vede nella pagina Sport e diventa l&apos;icona del gruppo della squadra. L&apos;emoji resta per i menu a tendina e i resoconti.</span>
      </label>
      <textarea className={textareaClass} value={f.description} maxLength={1000} placeholder="Descrizione" onChange={(e) => setF({ ...f, description: e.target.value })} />
      <label className="flex flex-col gap-1 text-xs">
        Profilo del punteggio (JSON)
        <input className={cn(inputClass, "font-mono text-xs")} value={f.profile} onChange={(e) => setF({ ...f, profile: e.target.value })} />
        <span className="text-muted-foreground">
          points: base, per, jitter · sets: best_of · bout: to · time: base (secondi), per · incontri: bouts e match (es. {`{"kind":"bout","to":15}`} o {`{"kind":"tennis"}`})
        </span>
      </label>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={f.allows_draw} onChange={(e) => setF({ ...f, allows_draw: e.target.checked })} /> Pareggio ammesso (stagione regolare)
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={f.status === "archived"} onChange={(e) => setF({ ...f, status: e.target.checked ? "archived" : "active" })} /> Archiviato (sparisce dalle scelte, lo storico resta)
        </label>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={save} disabled={f.name.trim().length < 2}>
          Salva
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Chiudi
        </Button>
        {sport && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            onClick={() => window.confirm(`Eliminare ${sport.name}? Si può solo se non ha mai giocato: gli atleti restano senza sport.`) && run(supabase.from("sports").delete().eq("id", sport.id))}
          >
            <Trash2 /> Elimina
          </Button>
        )}
      </div>

      {sport && (
        <section className="flex flex-col gap-1 border-t border-white/10 pt-2">
          <h4 className="font-heading text-lg tracking-wide text-peach">Ruoli</h4>
          {positions.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-32 font-medium">{p.name}</span>
              <span className="text-muted-foreground">
                {lookup.attrs.find((a) => a.id === p.attribute_id)?.code} + {lookup.skills.find((s) => s.id === p.skill_id)?.name ?? "—"} · posti{" "}
                {p.max_slots ?? "illimitati"}
                {p.team_bonus && " · vale per tutto l'equipaggio"}
              </span>
              <Button type="button" size="icon-xs" variant="ghost" aria-label="Elimina il ruolo" onClick={() => run(supabase.from("sport_positions").delete().eq("id", p.id))}>
                <Trash2 />
              </Button>
              <ComboEditor position={p} lookup={lookup} run={run} />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <input className={cn(inputClass, "h-8 w-32")} placeholder="Nuovo ruolo" value={pos.name} onChange={(e) => setPos({ ...pos, name: e.target.value })} />
            <select className={cn(inputClass, "h-8 w-20")} value={pos.attribute_id} onChange={(e) => setPos({ ...pos, attribute_id: e.target.value })}>
              {lookup.attrs.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code}
                </option>
              ))}
            </select>
            <select className={cn(inputClass, "h-8 w-48")} value={pos.skill_id} onChange={(e) => setPos({ ...pos, skill_id: e.target.value })}>
              <option value="">Abilità…</option>
              {lookup.skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input className={cn(inputClass, "h-8 w-20")} type="number" min={1} placeholder="posti" value={pos.max_slots} onChange={(e) => setPos({ ...pos, max_slots: e.target.value })} />
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={pos.team_bonus} onChange={(e) => setPos({ ...pos, team_bonus: e.target.checked })} /> per tutto l&apos;equipaggio
            </label>
            <Button
              type="button"
              size="xs"
              disabled={pos.name.trim().length < 2 || !pos.skill_id}
              onClick={() =>
                run(
                  supabase.from("sport_positions").insert({
                    sport_id: sport.id,
                    name: pos.name.trim(),
                    attribute_id: pos.attribute_id,
                    skill_id: pos.skill_id,
                    max_slots: pos.max_slots ? Number(pos.max_slots) : null,
                    team_bonus: pos.team_bonus,
                    sort_order: positions.length + 1,
                  }),
                )
              }
            >
              <Plus /> Aggiungi
            </Button>
          </div>
          <p className="text-[0.7rem] text-muted-foreground">
            Combinazioni in più: «e» = secondo tiro (si tirano due dadi e conta la media), «oppure» = alternativa del primo tiro. Per ogni tiro si usa da sola la combinazione migliore dell&apos;atleta; clic su «e»/«oppure» per cambiarla. Rissa vale anche per il contatto fisico (placcaggi, lotta).
          </p>
        </section>
      )}
    </div>
  );
}

/** Combinazioni in più di un ruolo: elenco con la X e aggiunta */
function ComboEditor({
  position,
  lookup,
  run,
}: {
  position: SportPosition;
  lookup: Lookup;
  run: (p: PromiseLike<{ error: { message: string } | null }>) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const combos = lookup.combos.filter((c) => c.position_id === position.id);
  const [attr, setAttr] = useState(lookup.attrs[0]?.id ?? "");
  const [skill, setSkill] = useState("");
  const [slot, setSlot] = useState<1 | 2>(2);
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 pl-32 text-[0.7rem]">
      {combos.map((c) => (
        <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
          <button
            type="button"
            className="font-semibold text-peach hover:underline"
            title={c.slot === 2 ? "Secondo tiro (si fa la media): clic per renderla un'alternativa del primo" : "Alternativa del primo tiro: clic per farne il secondo tiro"}
            onClick={() => run(supabase.from("sport_position_combos").update({ slot: c.slot === 2 ? 1 : 2 }).eq("id", c.id))}
          >
            {c.slot === 2 ? "e" : "oppure"}
          </button>
          {lookup.attrs.find((a) => a.id === c.attribute_id)?.code} + {lookup.skills.find((s) => s.id === c.skill_id)?.name ?? "—"}
          <button type="button" aria-label="Togli la combinazione" className="text-muted-foreground hover:text-destructive" onClick={() => run(supabase.from("sport_position_combos").delete().eq("id", c.id))}>
            ×
          </button>
        </span>
      ))}
      <select className={cn(inputClass, "h-7 w-32 text-xs")} value={slot} onChange={(e) => setSlot(Number(e.target.value) === 1 ? 1 : 2)} aria-label="Tiro">
        <option value={2}>e (secondo tiro)</option>
        <option value={1}>oppure (alternativa)</option>
      </select>
      <select className={cn(inputClass, "h-7 w-16 text-xs")} value={attr} onChange={(e) => setAttr(e.target.value)} aria-label="Caratteristica">
        {lookup.attrs.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code}
          </option>
        ))}
      </select>
      <select className={cn(inputClass, "h-7 w-40 text-xs")} value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Abilità">
        <option value="">Abilità…</option>
        {lookup.skills.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={!attr || !skill}
        onClick={() => {
          run(supabase.from("sport_position_combos").insert({ position_id: position.id, attribute_id: attr, skill_id: skill, sort_order: combos.length + 1, slot }));
          setSkill("");
        }}
      >
        <Plus /> Combinazione
      </Button>
    </div>
  );
}

/* ------------------------------ Università e rating ------------------------------ */

function TeamsTab({ lookup, reload }: { lookup: Lookup; reload: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState("");
  const { error, busy, act } = useAct(reload);
  const rating = (team: string, sport: string) => lookup.ratings.find((r) => r.team_id === team && r.sport_id === sport)?.rating;
  const sports = lookup.sports.filter((s) => s.status === "active");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Rating di forza per sport (8–16 per le rivali; vuoto = l&apos;università non ha quello sport). La nostra squadra rappresenta i compagni PNG dei personaggi.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <input className={cn(inputClass, "w-64")} value={name} maxLength={60} placeholder="Nuova università" onChange={(e) => setName(e.target.value)} />
        <Button type="button" size="sm" disabled={busy || name.trim().length < 2} onClick={() => act(() => supabase.from("sport_teams").insert({ name: name.trim() })).then(() => setName(""))}>
          <Plus /> Aggiungi
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-left font-normal text-muted-foreground">Università</th>
              {sports.map((s) => (
                <th key={s.id} className="px-0.5 font-normal" title={s.name}>
                  {s.icon}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lookup.teams.map((t) => (
              <tr key={t.id} className="border-t border-white/5">
                <td className="py-1 pr-2">
                  <input
                    className={cn(inputClass, "h-7 w-52", t.is_player_school && "text-peach")}
                    defaultValue={t.name}
                    onBlur={(e) => e.target.value.trim() !== t.name && act(() => supabase.from("sport_teams").update({ name: e.target.value.trim() }).eq("id", t.id))}
                  />
                  <span className="ml-1 text-muted-foreground">{t.is_player_school ? "nostra" : t.is_national ? "nazionale" : t.conference ? "Conference" : ""}</span>
                  {!t.is_player_school && (
                    <button type="button" className="ml-1 text-destructive" aria-label="Elimina" onClick={() => window.confirm(`Eliminare ${t.name}?`) && act(() => supabase.from("sport_teams").delete().eq("id", t.id))}>
                      ×
                    </button>
                  )}
                </td>
                {sports.map((s) => (
                  <td key={s.id} className="px-0.5">
                    <input
                      className={cn(inputClass, "h-7 w-10 px-1 text-center")}
                      defaultValue={rating(t.id, s.id) ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if ((rating(t.id, s.id)?.toString() ?? "") === v) return;
                        act(() =>
                          v
                            ? supabase.from("sport_team_ratings").upsert({ team_id: t.id, sport_id: s.id, rating: Number(v) })
                            : supabase.from("sport_team_ratings").delete().eq("team_id", t.id).eq("sport_id", s.id),
                        );
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ Premi ------------------------------ */

function AwardsTab({ sport }: { sport: Sport }) {
  const supabase = useMemo(() => createClient(), []);
  const [awards, setAwards] = useState<(SportAward & { characters: { name: string } | null })[]>([]);
  const [athletes, setAthletes] = useState<{ character_id: string; name: string }[]>([]);
  const [seasons, setSeasons] = useState<SportSeason[]>([]);
  const [f, setF] = useState({ character_id: "", name: "", description: "", season_id: "" });
  const load = useCallback(async () => {
    const [a, r, s] = await Promise.all([
      supabase.from("sport_awards").select("*, characters(name)").eq("sport_id", sport.id).order("created_at", { ascending: false }),
      supabase.from("sport_roster").select("character_id, characters(name)").eq("sport_id", sport.id),
      supabase.from("sport_seasons").select("*").eq("sport_id", sport.id).order("created_at", { ascending: false }),
    ]);
    setAwards((a.data ?? []) as typeof awards);
    const seen = new Map<string, string>();
    for (const x of (r.data ?? []) as unknown as { character_id: string; characters: { name: string } | null }[]) seen.set(x.character_id, x.characters?.name ?? "");
    setAthletes([...seen].map(([character_id, name]) => ({ character_id, name })));
    setSeasons((s.data ?? []) as SportSeason[]);
  }, [supabase, sport.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura dei premi
    load();
  }, [load]);
  const { error, busy, act } = useAct(load);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-xs text-muted-foreground">MVP, All-Conference e Academic All-American si assegnano da soli alla chiusura della stagione. Qui i premi personalizzati.</p>
      {error && <p className="text-destructive">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-4">
        <select className={inputClass} value={f.character_id} onChange={(e) => setF({ ...f, character_id: e.target.value })}>
          <option value="">Atleta…</option>
          {athletes.map((a) => (
            <option key={a.character_id} value={a.character_id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className={inputClass} value={f.season_id} onChange={(e) => setF({ ...f, season_id: e.target.value })}>
          <option value="">Senza stagione</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <input className={inputClass} value={f.name} maxLength={80} placeholder="Premio (es. Miglior timoniere)" onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={inputClass} value={f.description} maxLength={300} placeholder="Motivazione" onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
      <Button
        type="button"
        size="sm"
        className="self-start"
        disabled={busy || !f.character_id || f.name.trim().length < 2}
        onClick={() =>
          act(() =>
            supabase.from("sport_awards").insert({ sport_id: sport.id, season_id: f.season_id || null, character_id: f.character_id, name: f.name.trim(), description: f.description.trim() }),
          ).then(() => setF({ ...f, name: "", description: "" }))
        }
      >
        <Plus /> Assegna
      </Button>
      <ul className="flex flex-col gap-1">
        {awards.map((a) => (
          <li key={a.id} className="flex items-baseline gap-2 rounded-lg bg-white/5 px-2.5 py-1">
            <strong>{a.name}</strong> {a.characters?.name}
            <span className="text-xs text-muted-foreground">{a.description}</span>
            <Button type="button" size="icon-xs" variant="ghost" className="ml-auto" aria-label="Elimina" onClick={() => act(() => supabase.from("sport_awards").delete().eq("id", a.id))}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
