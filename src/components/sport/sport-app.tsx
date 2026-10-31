"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, LogOut, Medal, Trophy } from "lucide-react";
import { inputClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { firstName } from "@/lib/format";
import {
  EVENT_STATUS_LABEL,
  FORMAT_LABEL,
  INTENSITY_LABEL,
  PHASE_LABEL,
  SEASON_LABEL,
  SQUAD_LABEL,
  VENUE_LABEL,
  eventDate,
} from "@/lib/sport";
import { createClient } from "@/lib/supabase/client";
import type {
  MySport,
  Sport,
  SportAward,
  SportEvent,
  SportEventTeam,
  SportPosition,
  SportRosterEntry,
  SportSeason,
  SportStanding,
  SportTeam,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// Athletic Department: il mio sport (entrare, allenamento, eleggibilità) e le squadre
// con calendario, risultati, classifica, roster e premi.

type Catalog = { sports: Sport[]; positions: SportPosition[]; teams: SportTeam[]; taken: Record<string, number> };

export function SportApp({ characterId }: { characterId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [mine, setMine] = useState<MySport[]>([]);
  const [tab, setTab] = useState<"mio" | "squadre">(characterId ? "mio" : "squadre");
  const [week, setWeek] = useState<{ name: string; sport: string; icon: string; grade: number } | null>(null);

  const load = useCallback(async () => {
    const [s, p, t, r, w, m] = await Promise.all([
      supabase.from("sports").select("*").eq("status", "active").order("sort_order"),
      supabase.from("sport_positions").select("*").order("sort_order"),
      supabase.from("sport_teams").select("*").eq("active", true).order("name"),
      supabase.from("sport_roster").select("position_id, squad_status").is("left_at", null),
      supabase.rpc("sport_athlete_of_week"),
      characterId ? supabase.rpc("sport_my", { p_character: characterId }) : Promise.resolve({ data: [] }),
    ]);
    const taken: Record<string, number> = {};
    for (const x of (r.data ?? []) as { position_id: string | null; squad_status: string }[]) {
      if (x.position_id && (x.squad_status === "starter" || x.squad_status === "captain")) taken[x.position_id] = (taken[x.position_id] ?? 0) + 1;
    }
    setCatalog({ sports: (s.data ?? []) as Sport[], positions: (p.data ?? []) as SportPosition[], teams: (t.data ?? []) as SportTeam[], taken });
    setWeek((w.data ?? null) as typeof week);
    setMine((m.data ?? []) as MySport[]);
  }, [supabase, characterId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  if (!catalog) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  return (
    <div className="flex flex-col gap-3">
      {week && (
        <p className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-sm">
          <Medal className="size-4 text-sand" /> Atleta della settimana: <strong>{firstName(week.name)}</strong> · {week.icon} {week.sport} · voto {week.grade}
        </p>
      )}
      <nav className="flex gap-1 self-start rounded-full bg-white/5 p-1">
        {characterId && (
          <TabButton active={tab === "mio"} onClick={() => setTab("mio")}>
            Il mio sport
          </TabButton>
        )}
        <TabButton active={tab === "squadre"} onClick={() => setTab("squadre")}>
          Squadre e risultati
        </TabButton>
      </nav>
      {tab === "mio" && characterId ? <MySportPanel characterId={characterId} catalog={catalog} mine={mine} onChange={load} /> : <TeamsPanel catalog={catalog} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-full px-3 py-1.5 text-xs", active ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}>
      {children}
    </button>
  );
}

/* ------------------------------ Il mio sport ------------------------------ */

function MySportPanel({ characterId, catalog, mine, onChange }: { characterId: string; catalog: Catalog; mine: MySport[]; onChange: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [sportId, setSportId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function call(fn: string, args: Record<string, unknown>, okText?: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    const { data, error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    if (e) return setError(e.message);
    if (data === "in_attesa") setInfo("La stagione è in corso: il cambio lo approva il Master. Ti arriverà un messaggio.");
    else if (okText) setInfo(okText);
    onChange();
  }

  const positions = catalog.positions.filter((p) => p.sport_id === sportId);
  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-mint">{info}</p>}
      {mine.length === 0 && <p className="text-sm text-muted-foreground">Non fai parte di nessuna squadra. Scegli uno sport e un ruolo: niente provini, entri subito nel roster e nel gruppo della squadra.</p>}
      {mine.map((m) => (
        <section key={m.roster_id} className="glass flex flex-col gap-2 rounded-2xl p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-2xl tracking-wide">
              {m.icon} {m.sport}
            </h2>
            <span className="text-xs text-muted-foreground">
              {SEASON_LABEL[m.season]} · {FORMAT_LABEL[m.format]}
            </span>
          </div>
          <p className="flex flex-wrap gap-1.5 text-xs">
            <Pill>{m.position ?? "Senza ruolo"}</Pill>
            <Pill className={m.squad_status === "captain" ? "bg-sand/25" : undefined}>{SQUAD_LABEL[m.squad_status]}</Pill>
            {m.scholarship && <Pill className={m.eligibility.eligible ? "bg-mint/20" : "bg-white/10 line-through"}>Borsa di studio atletica</Pill>}
            <Pill className={m.eligibility.eligible ? "bg-mint/20 text-mint" : "bg-destructive/20 text-destructive"}>{m.eligibility.eligible ? "Eleggibile" : "Ineleggibile"}</Pill>
            {m.injury_events_left > 0 && (
              <Pill className="bg-destructive/20">🩹 Infortunato: {m.injury_events_left >= 999 ? "fino a fine stagione" : `${m.injury_events_left} eventi`}</Pill>
            )}
            {m.returning && <Pill>Rientro da infortunio (−1)</Pill>}
            {m.suspended_events > 0 && <Pill className="bg-destructive/20">Squalificato: {m.suspended_events} evento</Pill>}
          </p>
          {!m.eligibility.eligible && (
            <ul className="list-disc pl-5 text-xs text-destructive">
              {m.eligibility.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {!m.eligibility.eligible && <p className="text-xs text-muted-foreground">Resti nel roster e nel gruppo, ti alleni, ma non gareggi finché non torni in regola.</p>}
          <p className="text-xs text-muted-foreground">
            Eventi giocati: {m.events}
            {m.avg_grade !== null && ` · media voto ${m.avg_grade}`}
            {m.highlights > 0 && ` · ${m.highlights} highlight`} · stagioni di eleggibilità usate: {m.seasons_used} su 4
            {m.redshirt_years > 0 && ` · Redshirt: ${m.redshirt_years}`}
            {m.training_bonus > 0 && ` · bonus allenamenti +${m.training_bonus}`}
          </p>
          {(m.pending_sport || m.pending_position) && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-peach">
              Cambio in attesa del Master: {m.pending_sport ?? m.sport} · {m.pending_position}
              <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => call("sport_cancel_change", { p_character: characterId, p_sport: m.sport_id })}>
                Ritira
              </Button>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5">
              Allenamento
              <select
                className={cn(inputClass, "h-8 w-32")}
                value={m.training_intensity}
                disabled={busy || m.season_started}
                onChange={(e) => call("sport_set_training", { p_character: characterId, p_sport: m.sport_id, p_intensity: e.target.value, p_redshirt: m.squad_status === "redshirt" })}
              >
                {(Object.keys(INTENSITY_LABEL) as (keyof typeof INTENSITY_LABEL)[]).map((k) => (
                  <option key={k} value={k}>
                    {INTENSITY_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={m.squad_status === "redshirt"}
                disabled={busy || m.season_started}
                onChange={(e) => call("sport_set_training", { p_character: characterId, p_sport: m.sport_id, p_intensity: m.training_intensity, p_redshirt: e.target.checked })}
              />
              Redshirt quest&apos;anno
            </label>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="ml-auto"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Lasciare ${m.sport}? Esci dal roster e dal gruppo; lo storico resta.`)) call("sport_leave", { p_character: characterId, p_sport: m.sport_id }, "Hai lasciato la squadra.");
              }}
            >
              <LogOut /> Lascia
            </Button>
          </div>
          <p className="text-[0.7rem] text-muted-foreground">
            Leggera −1 · Normale · Intensa +1 ai tiri sportivi ma −1 agli esami del semestre. Intensità e Redshirt si scelgono prima del primo evento della stagione.
          </p>
        </section>
      ))}

      <section className="glass flex flex-col gap-2 rounded-2xl p-3">
        <h2 className="font-heading text-xl tracking-wide text-peach">{mine.length ? "Cambia o aggiungi uno sport" : "Scegli uno sport"}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className={inputClass}
            value={sportId}
            onChange={(e) => {
              setSportId(e.target.value);
              setPositionId("");
            }}
          >
            <option value="">Sport…</option>
            {catalog.sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.name} ({SEASON_LABEL[s.season]})
              </option>
            ))}
          </select>
          <select className={inputClass} value={positionId} onChange={(e) => setPositionId(e.target.value)} disabled={!sportId}>
            <option value="">Ruolo…</option>
            {positions.map((p) => {
              const free = p.max_slots === null ? null : Math.max(0, p.max_slots - (catalog.taken[p.id] ?? 0));
              return (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {free === null ? "" : free > 0 ? ` · ${free} posti da titolare` : " · entri come riserva"}
                </option>
              );
            })}
          </select>
        </div>
        {sportId && <p className="text-xs text-muted-foreground">{catalog.sports.find((s) => s.id === sportId)?.description}</p>}
        <Button
          type="button"
          size="sm"
          className="self-start rounded-full"
          disabled={!sportId || !positionId || busy}
          onClick={() => call("sport_join", { p_character: characterId, p_sport: sportId, p_position: positionId }, "Sei in squadra!")}
        >
          Entra in squadra
        </Button>
        <p className="text-[0.7rem] text-muted-foreground">
          Uno sport per volta (con Doppio sport due, di stagioni diverse). Cambiare sport o ruolo a stagione in corso va approvato dal Master.
        </p>
      </section>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-full bg-white/10 px-2 py-0.5", className)}>{children}</span>;
}

/* ------------------------------ Squadre e risultati ------------------------------ */

function TeamsPanel({ catalog }: { catalog: Catalog }) {
  const [sportId, setSportId] = useState(catalog.sports[0]?.id ?? "");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {catalog.sports.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSportId(s.id)}
            className={cn("rounded-full border px-2.5 py-1 text-xs", sportId === s.id ? "border-flamingo bg-flamingo/20" : "border-white/10 hover:bg-white/5")}
          >
            {s.icon} {s.name}
          </button>
        ))}
      </div>
      {sportId && <TeamView key={sportId} sport={catalog.sports.find((s) => s.id === sportId)!} catalog={catalog} />}
    </div>
  );
}

type RosterRow = SportRosterEntry & { characters: { name: string } | null };

export function TeamView({ sport, catalog }: { sport: Sport; catalog: Catalog }) {
  const supabase = useMemo(() => createClient(), []);
  const [seasons, setSeasons] = useState<SportSeason[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [eventTeams, setEventTeams] = useState<SportEventTeam[]>([]);
  const [standings, setStandings] = useState<SportStanding[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [awards, setAwards] = useState<(SportAward & { characters: { name: string } | null })[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from("sport_seasons").select("*").eq("sport_id", sport.id).neq("status", "planning").order("created_at", { ascending: false }),
      supabase.from("sport_roster").select("*, characters(name)").eq("sport_id", sport.id).is("left_at", null),
    ]).then(([s, r]) => {
      if (!alive) return;
      const list = (s.data ?? []) as SportSeason[];
      setSeasons(list);
      setSeasonId(list.find((x) => x.status === "active")?.id ?? list[0]?.id ?? "");
      setRoster((r.data ?? []) as RosterRow[]);
    });
    return () => {
      alive = false;
    };
  }, [supabase, sport.id]);

  useEffect(() => {
    if (!seasonId) return;
    let alive = true;
    Promise.all([
      supabase.from("sport_events").select("*").eq("season_id", seasonId).order("starts_at"),
      supabase.rpc("sport_standings", { p_season: seasonId }),
      supabase.from("sport_awards").select("*, characters(name)").eq("season_id", seasonId),
    ]).then(async ([e, st, aw]) => {
      const evs = (e.data ?? []) as SportEvent[];
      const et = evs.length ? await supabase.from("sport_event_teams").select("*").in("event_id", evs.map((x) => x.id)) : { data: [] };
      if (!alive) return;
      setEvents(evs);
      setEventTeams((et.data ?? []) as SportEventTeam[]);
      setStandings((st.data ?? []) as SportStanding[]);
      setAwards((aw.data ?? []) as typeof awards);
    });
    return () => {
      alive = false;
    };
  }, [supabase, seasonId]);

  const teamName = (id: string) => catalog.teams.find((t) => t.id === id)?.name ?? "—";
  const posName = (id: string | null) => catalog.positions.find((p) => p.id === id)?.name ?? "—";
  const isRace = sport.format.endsWith("race");
  const order = ["captain", "starter", "reserve", "redshirt"];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{sport.description}</p>
      {seasons.length > 1 && (
        <select className={cn(inputClass, "w-48")} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              Stagione {s.label}
              {s.status === "active" ? " (in corso)" : ""}
            </option>
          ))}
        </select>
      )}
      {!seasonId && <p className="text-sm text-muted-foreground">Nessuna stagione in calendario per ora.</p>}

      {standings.length > 0 && (
        <section>
          <h3 className="mb-1 font-heading text-lg tracking-wide text-peach">Classifica della Conference</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-normal">Squadra</th>
                {isRace ? <th className="font-normal">Punti</th> : <><th className="font-normal">V</th><th className="font-normal">S</th>{sport.allows_draw && <th className="font-normal">P</th>}<th className="font-normal">Diff.</th></>}
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.team_id} className={cn("border-t border-white/5", s.is_player_school && "text-peach")}>
                  <td className="py-0.5">
                    {i + 1}. {s.name}
                  </td>
                  {isRace ? (
                    <td className="text-center">{s.points}</td>
                  ) : (
                    <>
                      <td className="text-center">{s.won}</td>
                      <td className="text-center">{s.lost}</td>
                      {sport.allows_draw && <td className="text-center">{s.drawn}</td>}
                      <td className="text-center">{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {events.length > 0 && (
        <section>
          <h3 className="mb-1 font-heading text-lg tracking-wide text-peach">Calendario e risultati</h3>
          <ul className="flex flex-col gap-1">
            {events.map((e) => {
              const teams = eventTeams.filter((t) => t.event_id === e.id);
              const published = e.status === "published";
              return (
                <li key={e.id} className={cn("rounded-lg bg-white/5 px-2.5 py-1.5 text-sm", e.status === "cancelled" && "opacity-50")}>
                  <button type="button" className="flex w-full flex-wrap items-baseline gap-x-2 text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                    <span className="text-xs text-muted-foreground">{eventDate(e.starts_at)}</span>
                    <span>
                      {isRace
                        ? `${e.kind} · ${teams.length} squadre`
                        : teams
                            .sort((a) => (catalog.teams.find((t) => t.id === a.team_id)?.is_player_school ? -1 : 1))
                            .map((t) => `${teamName(t.team_id)}${published && t.score !== null ? ` ${t.score}` : ""}`)
                            .join(" – ")}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {VENUE_LABEL[e.venue]} · {e.phase !== "regular" ? `${PHASE_LABEL[e.phase]} · ` : ""}
                      {published ? "Concluso" : EVENT_STATUS_LABEL[e.status === "simulated" ? "scheduled" : e.status]}
                    </span>
                  </button>
                  {open === e.id && published && e.recap_text && <p className="mt-1 text-xs whitespace-pre-line">{e.recap_text}</p>}
                  {open === e.id && e.notes && <p className="mt-1 text-xs text-muted-foreground">{e.notes}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1 font-heading text-lg tracking-wide text-peach">Roster</h3>
        {roster.length === 0 && <p className="text-sm text-muted-foreground">Nessun personaggio in squadra.</p>}
        <ul className="grid gap-1 sm:grid-cols-2">
          {[...roster]
            .sort((a, b) => order.indexOf(a.squad_status) - order.indexOf(b.squad_status))
            .map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1 text-sm">
                <Link href={`/scheda/${r.character_id}`} className="hover:underline">
                  {firstName(r.characters?.name ?? "")}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {posName(r.position_id)} · {SQUAD_LABEL[r.squad_status]}
                  {r.injury_events_left > 0 && " · 🩹"}
                </span>
              </li>
            ))}
        </ul>
      </section>

      {awards.length > 0 && (
        <section>
          <h3 className="mb-1 flex items-center gap-1.5 font-heading text-lg tracking-wide text-peach">
            <Trophy className="size-4" /> Premi
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {awards.map((a) => (
              <li key={a.id}>
                <strong>{a.name}</strong>: {firstName(a.characters?.name ?? "")}
                {a.description && <span className="text-xs text-muted-foreground"> · {a.description}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
