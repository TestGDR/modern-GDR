"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Crown, Loader2, Trash2, Trophy } from "lucide-react";
import { inputClass } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { eventDate } from "@/lib/sport";
import { createClient } from "@/lib/supabase/client";
import { useResync } from "@/lib/use-resync";
import { cn } from "@/lib/utils";

// Campionato di una stagione: fasi, classifica a punti, qualificazione ai Nationals, tabelloni, albo d'oro.
// Tutto arriva da sport_championship (database); le scritture dello staff passano dalle funzioni sport_*.

export type ChampPhase = "preseason" | "regular" | "conference" | "nationals" | "concluded";
export type QualStatus = "in_corsa" | "qualificato" | "non_qualificato" | "eliminato" | "campione";

type TeamRow = {
  team_id: string;
  name: string;
  group: "conference" | "national";
  is_player_school?: boolean;
  rank?: number;
  played?: number;
  won?: number;
  drawn?: number;
  lost?: number;
  diff?: number;
  points?: number;
  adj_points?: number;
  conf_place?: number | null;
  rating?: number;
  missing?: number;
  qualifies: boolean;
  auto: boolean;
  override?: boolean;
  reasons: string[];
  status: QualStatus;
  provisional: boolean;
};
type IndividualRow = { character_id: string; name: string; events: number; points: number; qualifies: boolean; reasons: string[]; status: QualStatus };
type Match = {
  id: number;
  phase: "conference" | "nationals";
  round: number;
  slot: number;
  team_a: string | null;
  team_b: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  winner_id: string | null;
  status: "pending" | "done";
  event_id: string | null;
  starts_at: string | null;
  event_status: string | null;
};
export type ChampRules = {
  pts_win: number;
  pts_draw: number;
  pts_loss: number;
  placement_points: number[];
  regular_rounds: number;
  nonconf_games: number;
  race_meets: number;
  min_events: number;
  nationals_threshold: number;
  nationals_slots: number;
  nationals_others: number;
  conference_teams: number;
  conference_champion_auto: boolean;
  conference_min_place: number | null;
  tiebreakers: string[];
  individual_enabled: boolean;
  individual_grade_points: number[];
  individual_threshold: number;
  individual_min_events: number;
  individual_slots: number;
};
type Championship = {
  season: { id: string; label: string; status: string; phase: ChampPhase; confirmed_at: string | null; conference_champion: string | null; national_champion: string | null };
  sport: { id: string; name: string; format: string; allows_draw: boolean; category: string };
  rules: ChampRules;
  teams: TeamRow[];
  individuals: IndividualRow[];
  brackets: Match[];
  adjustments: { id: number; team: string; team_id: string; points: number; tiebreak: number; note: string; created_at: string }[];
  overrides: { id: number; kind: "team" | "individual"; team: string | null; team_id: string | null; character: string | null; character_id: string | null; status: string; reason: string }[];
  honors: { label: string; conference: string | null; national: string | null }[];
};

export const PHASES: { key: ChampPhase; label: string }[] = [
  { key: "preseason", label: "Preseason" },
  { key: "regular", label: "Regular Season" },
  { key: "conference", label: "Conference" },
  { key: "nationals", label: "Nationals" },
  { key: "concluded", label: "Conclusa" },
];
const STATUS: Record<QualStatus, { label: string; cls: string }> = {
  in_corsa: { label: "In corsa", cls: "bg-white/10 text-foreground" },
  qualificato: { label: "Qualificato", cls: "bg-mint/20 text-mint" },
  non_qualificato: { label: "Non qualificato", cls: "bg-white/5 text-muted-foreground" },
  eliminato: { label: "Eliminato", cls: "bg-flamingo/15 text-flamingo" },
  campione: { label: "Campione", cls: "bg-sand/25 text-sand" },
};
const TIEBREAK_LABEL: Record<string, string> = {
  scontri_diretti: "Scontri diretti",
  differenza: "Differenza punti/reti",
  vittorie: "Vittorie",
  conference: "Piazzamento in Conference",
};

const isRace = (format: string) => format.endsWith("race");

function useChampionship(seasonId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Championship | null | undefined>(undefined);
  const load = useCallback(async () => {
    const { data: d } = await supabase.rpc("sport_championship", { p_season: seasonId });
    setData((d ?? null) as Championship | null);
  }, [supabase, seasonId]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useResync(load);
  return { data, load, supabase };
}

/* ------------------------------ Vista (giocatori e staff) ------------------------------ */

export function ChampionshipView({ seasonId, reloadKey = 0 }: { seasonId: string; reloadKey?: number }) {
  const { data, load } = useChampionship(seasonId);
  useEffect(() => {
    if (reloadKey) load();
  }, [reloadKey, load]);
  if (data === undefined) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  if (data === null) return null;
  return <ChampionshipBody data={data} />;
}

function ChampionshipBody({ data }: { data: Championship }) {
  const { season, sport, rules, teams } = data;
  const race = isRace(sport.format);
  const conference = teams.filter((t) => t.group === "conference");
  const nationals = teams.filter((t) => t.group === "national");
  const [open, setOpen] = useState<string | null>(null);
  const phaseIndex = PHASES.findIndex((p) => p.key === season.phase);

  return (
    <div className="flex flex-col gap-4">
      {/* fasi */}
      <ol className="flex flex-wrap gap-1 text-[0.7rem]" aria-label="Fasi della stagione">
        {PHASES.map((p, i) => (
          <li
            key={p.key}
            className={cn(
              "rounded-full px-2.5 py-1",
              i === phaseIndex ? "bg-flamingo/30 font-semibold text-white" : i < phaseIndex ? "bg-white/10 text-muted-foreground" : "bg-white/5 text-muted-foreground/60",
            )}
          >
            {i + 1}. {p.label}
          </li>
        ))}
      </ol>
      {(season.conference_champion || season.national_champion) && (
        <p className="flex flex-wrap gap-3 text-sm">
          {season.conference_champion && (
            <span className="flex items-center gap-1.5">
              <Trophy className="size-4 text-peach" /> Campione di Conference: <strong>{season.conference_champion}</strong>
            </span>
          )}
          {season.national_champion && (
            <span className="flex items-center gap-1.5">
              <Crown className="size-4 text-sand" /> Campione nazionale: <strong>{season.national_champion}</strong>
            </span>
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {race
          ? `Punti per piazzamento: ${rules.placement_points.map((p, i) => `${i + 1}° ${p}`).join(", ")}.`
          : `Vittoria ${rules.pts_win}${sport.allows_draw ? `, pareggio ${rules.pts_draw}` : ""}, sconfitta ${rules.pts_loss}.`}{" "}
        Nationals: almeno <strong>{rules.nationals_threshold} punti</strong> e <strong>{rules.min_events} gare</strong>
        {rules.conference_min_place ? `, almeno ${rules.conference_min_place}° in Conference` : ""}; {rules.nationals_slots} posti
        {rules.nationals_others ? ` (${rules.nationals_others} per le altre Conference)` : ""}
        {rules.conference_champion_auto ? ", il campione di Conference entra di diritto" : ""}.
        {!season.confirmed_at && season.phase !== "preseason" && " Gli stati sono provvisori finché lo staff non conferma i qualificati."}
      </p>

      {/* classifica */}
      <section className="overflow-x-auto">
        <h3 className="mb-1 font-heading text-lg tracking-wide text-peach">Classifica della Conference</h3>
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-normal">Squadra</th>
              <th className="font-normal">G</th>
              {!race && (
                <>
                  <th className="font-normal">V</th>
                  {sport.allows_draw && <th className="font-normal">P</th>}
                  <th className="font-normal">S</th>
                  <th className="font-normal">Diff.</th>
                </>
              )}
              <th className="font-normal">Punti</th>
              <th className="font-normal">Mancano</th>
              <th className="text-right font-normal">Stato</th>
            </tr>
          </thead>
          <tbody>
            {conference.map((t) => (
              <TeamLine key={t.team_id} t={t} race={race} draws={sport.allows_draw} open={open === t.team_id} onToggle={() => setOpen(open === t.team_id ? null : t.team_id)} />
            ))}
          </tbody>
        </table>
        {conference.length === 0 && <p className="text-sm text-muted-foreground">Ancora nessuna squadra in classifica.</p>}
        <p className="mt-1 text-[0.7rem] text-muted-foreground">Clicca una squadra per vedere i motivi del suo stato.</p>
      </section>

      {nationals.length > 0 && (
        <section>
          <h3 className="mb-1 font-heading text-lg tracking-wide text-peach">Altre Conference</h3>
          <ul className="flex flex-wrap gap-1.5 text-xs">
            {nationals.map((t) => (
              <li key={t.team_id} className="flex items-center gap-1.5 rounded-full bg-white/5 py-1 pr-1 pl-2.5">
                {t.name}
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">Campioni di altre Conference: vanno ai Nationals d&apos;ufficio.</p>
        </section>
      )}

      {data.individuals.length > 0 && (
        <section className="overflow-x-auto">
          <h3 className="mb-1 font-heading text-lg tracking-wide text-peach">Qualificazione individuale</h3>
          <table className="w-full min-w-[24rem] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-normal">Atleta</th>
                <th className="font-normal">Gare</th>
                <th className="font-normal">Punti</th>
                <th className="text-right font-normal">Stato</th>
              </tr>
            </thead>
            <tbody>
              {data.individuals.map((p) => (
                <tr key={p.character_id} className="border-t border-white/5" title={p.reasons.join(" · ")}>
                  <td className="py-1">{p.name}</td>
                  <td className="text-center">{p.events}</td>
                  <td className="text-center">
                    {p.points} / {rules.individual_threshold}
                  </td>
                  <td className="text-right">
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            Punti dai voti di ogni gara; ai Nationals vanno i migliori {rules.individual_slots} con almeno {rules.individual_threshold} punti e {rules.individual_min_events} gare, anche se la squadra non si qualifica.
          </p>
        </section>
      )}

      {(["conference", "nationals"] as const).map((ph) => {
        const matches = data.brackets.filter((m) => m.phase === ph);
        return matches.length > 0 ? <Bracket key={ph} title={ph === "conference" ? "Torneo di Conference" : "Nationals"} matches={matches} /> : null;
      })}

      {data.honors.length > 0 && (
        <section>
          <h3 className="mb-1 font-heading text-lg tracking-wide text-peach">Albo d&apos;oro</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {data.honors.map((h) => (
              <li key={h.label} className="flex flex-wrap gap-x-3 rounded-lg bg-white/5 px-2.5 py-1.5">
                <span className="font-medium">{h.label}</span>
                {h.conference && <span className="text-muted-foreground">Conference: {h.conference}</span>}
                {h.national && <span className="text-sand">Nazionale: {h.national}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: QualStatus }) {
  const s = STATUS[status];
  return <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem] whitespace-nowrap", s.cls)}>{s.label}</span>;
}

function TeamLine({ t, race, draws, open, onToggle }: { t: TeamRow; race: boolean; draws: boolean; open: boolean; onToggle: () => void }) {
  const cols = race ? 5 : draws ? 9 : 8;
  return (
    <>
      <tr className={cn("cursor-pointer border-t border-white/5 hover:bg-white/5", t.is_player_school && "text-peach")} onClick={onToggle}>
        <td className="py-1">
          <span className="flex items-center gap-1">
            <ChevronDown className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            {t.rank}. {t.name}
          </span>
        </td>
        <td className="text-center">{t.played}</td>
        {!race && (
          <>
            <td className="text-center">{t.won}</td>
            {draws && <td className="text-center">{t.drawn}</td>}
            <td className="text-center">{t.lost}</td>
            <td className="text-center">{(t.diff ?? 0) > 0 ? `+${t.diff}` : t.diff}</td>
          </>
        )}
        <td className="text-center font-semibold">
          {t.points}
          {t.adj_points ? <span className="ml-0.5 text-[0.65rem] text-muted-foreground">({t.adj_points > 0 ? "+" : ""}{t.adj_points})</span> : null}
        </td>
        <td className="text-center text-muted-foreground">{t.missing ? t.missing : "—"}</td>
        <td className="text-right">
          <StatusBadge status={t.status} />
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={cols} className="pb-2 pl-5 text-xs text-muted-foreground">
            {t.reasons.join(" · ") || "—"}
            {t.conf_place ? ` · ${t.conf_place}° nel torneo di Conference` : ""}
            {t.provisional && t.status !== "in_corsa" ? " · in attesa della conferma dello staff" : ""}
          </td>
        </tr>
      )}
    </>
  );
}

function Bracket({ title, matches }: { title: string; matches: Match[] }) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const roundName = (n: number) => (n === 1 ? "Finale" : n === 2 ? "Semifinali" : n === 4 ? "Quarti" : n === 8 ? "Ottavi" : "Primo turno");
  return (
    <section>
      <h3 className="mb-1 font-heading text-lg tracking-wide text-peach">{title}</h3>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {rounds.map((r) => {
          const list = matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
          return (
            <div key={r} className="flex min-w-44 flex-col justify-around gap-2">
              <p className="text-[0.7rem] tracking-wider text-muted-foreground uppercase">{roundName(list.length)}</p>
              {list.map((m) => (
                <div key={m.id} className="rounded-lg border border-white/10 bg-night/40 p-1.5 text-xs">
                  {(
                    [
                      [m.team_a, m.team_a_id, m.score_a],
                      [m.team_b, m.team_b_id, m.score_b],
                    ] as const
                  ).map(([name, id, score], i) => (
                    <p key={i} className={cn("flex justify-between gap-2", m.winner_id && m.winner_id === id ? "font-semibold text-white" : m.status === "done" ? "text-muted-foreground" : "")}>
                      <span className="truncate">{name ?? (m.status === "done" ? "turno libero" : "—")}</span>
                      <span>{score ?? ""}</span>
                    </p>
                  ))}
                  {m.status === "pending" && m.starts_at && <p className="mt-0.5 text-[0.65rem] text-peach">{eventDate(m.starts_at)}</p>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------ Pannello dello staff ------------------------------ */

function fromLocalInput(v: string) {
  const guess = new Date(`${v}:00Z`);
  const rome = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (rome.getTime() - utc.getTime())).toISOString();
}

type LogRow = { id: number; action: string; detail: Record<string, unknown>; created_at: string; profiles: { username: string } | null };

export function ChampionshipManager({ seasonId, roster }: { seasonId: string; roster: { id: string; name: string }[] }) {
  const { data, load, supabase } = useChampionship(seasonId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [start, setStart] = useState("");
  const [days, setDays] = useState(7);
  const [log, setLog] = useState<LogRow[]>([]);
  const [reload, setReload] = useState(0);

  const loadLog = useCallback(async () => {
    const { data: l } = await supabase
      .from("sport_season_log")
      .select("id, action, detail, created_at, profiles(username)")
      .eq("season_id", seasonId)
      .order("created_at", { ascending: false })
      .limit(60);
    setLog((l ?? []) as unknown as LogRow[]);
  }, [supabase, seasonId]);
  useEffect(() => {
    const t = setTimeout(loadLog, 0);
    return () => clearTimeout(t);
  }, [loadLog]);

  async function run(fn: string, args: Record<string, unknown>, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    if (e) setError(e.message);
    await load();
    await loadLog();
    setReload((r) => r + 1);
  }

  if (data === undefined) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  if (data === null) return <p className="text-sm text-muted-foreground">Stagione non trovata.</p>;
  const { season, sport } = data;
  const race = isRace(sport.format);
  const phaseIndex = PHASES.findIndex((p) => p.key === season.phase);
  const next = PHASES[phaseIndex + 1];
  const conferenceTeams = data.teams.filter((t) => t.group === "conference");
  const allTeams = data.teams;
  const hasConf = data.brackets.some((m) => m.phase === "conference");
  const hasNat = data.brackets.some((m) => m.phase === "nationals");
  const startIso = start ? fromLocalInput(start) : null;
  const box = "flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3";

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}

      {/* fasi */}
      <section className={box}>
        <h4 className="font-semibold">Fase della stagione: {PHASES[phaseIndex]?.label}</h4>
        <div className="flex flex-wrap items-center gap-2">
          {next && (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(
                  "sport_phase_set",
                  { p_season: season.id, p_phase: next.key, p_note: note },
                  next.key === "concluded" ? "Concludere la stagione? Si assegnano i premi e si contano le stagioni di eleggibilità." : undefined,
                )
              }
            >
              Passa a {next.label}
            </Button>
          )}
          <select
            className={cn(inputClass, "h-8 w-44")}
            value=""
            onChange={(e) => e.target.value && run("sport_phase_set", { p_season: season.id, p_phase: e.target.value, p_note: note })}
            aria-label="Correggi la fase"
          >
            <option value="">Correggi la fase…</option>
            {PHASES.filter((p) => p.key !== season.phase).map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <input className={cn(inputClass, "h-8 min-w-0 flex-1")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (obbligatoria per tornare indietro)" />
        </div>
        <p className="text-xs text-muted-foreground">Ogni cambio finisce nel registro qui sotto. Passare ai Nationals richiede i qualificati confermati.</p>
      </section>

      <RulesEditor seasonId={season.id} rules={data.rules} race={race} onSaved={() => { load(); loadLog(); setReload((r) => r + 1); }} />

      {/* conference */}
      <section className={box}>
        <h4 className="font-semibold">Conference</h4>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          Prima gara il
          <input type="datetime-local" className={cn(inputClass, "h-8 w-48")} value={start} onChange={(e) => setStart(e.target.value)} />
          turni ogni
          <input type="number" min={1} max={30} className={cn(inputClass, "h-8 w-16")} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          giorni
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasConf && !data.season.conference_champion && (
            <Button type="button" size="sm" disabled={busy || !startIso} onClick={() => run("sport_conference_generate", { p_season: season.id, p_start: startIso })}>
              Genera il torneo di Conference
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => run("sport_bracket_advance", { p_season: season.id, p_phase: "conference", p_start: startIso, p_days: days })}>
            {race ? "Proclama il campione (dalla gara pubblicata)" : "Chiudi il turno / proclama il campione"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              const r = window.prompt("Motivo per azzerare il torneo di Conference:");
              if (r) run("sport_bracket_reset", { p_season: season.id, p_phase: "conference", p_reason: r });
            }}
          >
            Azzera
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {race
            ? "Si crea una gara unica (Conference Championship) con le squadre ammesse: simulala o giocala e pubblicala, poi proclama il campione."
            : "Le partite della nostra università compaiono negli eventi da simulare o giocare; quelle tra le altre si decidono da sole quando chiudi il turno."}
        </p>
      </section>

      {/* qualificazione */}
      <section className={box}>
        <h4 className="font-semibold">Qualificazione ai Nationals</h4>
        <p className="text-xs text-muted-foreground">
          {season.confirmed_at ? `Elenco confermato il ${eventDate(season.confirmed_at)}.` : "Elenco provvisorio: confermalo a fine Conference. Solo allora vale e si possono creare i Nationals."}
        </p>
        <div className="flex flex-wrap gap-2">
          {!season.confirmed_at ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => run("sport_qualification_confirm", { p_season: season.id }, "Confermare l'elenco dei qualificati? I giocatori ricevono l'avviso.")}>
              Conferma i qualificati
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                const r = window.prompt("Motivo per riaprire l'elenco (es. risultato rettificato):");
                if (r) run("sport_qualification_reopen", { p_season: season.id, p_reason: r });
              }}
            >
              Riapri l&apos;elenco
            </Button>
          )}
        </div>
        <OverrideForm teams={allTeams} roster={roster} onSubmit={(args) => run("sport_qualification_override", { p_season: season.id, ...args })} busy={busy} />
        {data.overrides.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs">
            {data.overrides.map((o) => (
              <li key={o.id} className="flex items-center gap-2 rounded-lg bg-night/30 px-2 py-1">
                <span className={o.status === "qualificato" ? "text-mint" : "text-flamingo"}>{o.status === "qualificato" ? "Inserito" : "Escluso"}</span>
                <span className="font-medium">{o.team ?? o.character}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.reason}</span>
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-destructive/20"
                  aria-label="Togli l'eccezione"
                  onClick={() => run("sport_qualification_override", { p_season: season.id, p_team: o.team_id, p_character: o.character_id, p_status: null, p_reason: "" })}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* nationals */}
      <section className={box}>
        <h4 className="font-semibold">Nationals</h4>
        <div className="flex flex-wrap gap-2">
          {!hasNat && !data.season.national_champion && (
            <Button type="button" size="sm" disabled={busy || !startIso || !season.confirmed_at} onClick={() => run("sport_nationals_generate", { p_season: season.id, p_start: startIso })}>
              Genera i Nationals
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => run("sport_bracket_advance", { p_season: season.id, p_phase: "nationals", p_start: startIso, p_days: days })}>
            {race ? "Proclama il campione (dalla gara pubblicata)" : "Chiudi il turno / proclama il campione"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              const r = window.prompt("Motivo per azzerare i Nationals:");
              if (r) run("sport_bracket_reset", { p_season: season.id, p_phase: "nationals", p_reason: r });
            }}
          >
            Azzera
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Usa data e intervallo del riquadro Conference. Chi non è qualificato non può entrare in una gara dei Nationals, né come squadra né come convocato.</p>
      </section>

      {/* correzioni */}
      <AdjustmentForm teams={conferenceTeams} seasonId={season.id} onDone={() => { load(); loadLog(); setReload((r) => r + 1); }} />
      {data.adjustments.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {data.adjustments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-lg bg-night/30 px-2 py-1">
              <span className="font-medium">{a.team}</span>
              {a.points !== 0 && <span>{a.points > 0 ? `+${a.points}` : a.points} punti</span>}
              {a.tiebreak !== 0 && <span>spareggio {a.tiebreak > 0 ? `+${a.tiebreak}` : a.tiebreak}</span>}
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{a.note}</span>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-destructive/20"
                aria-label="Togli la correzione"
                onClick={async () => {
                  setError(null);
                  const { error: e } = await supabase.from("sport_standing_adjustments").delete().eq("id", a.id);
                  if (e) setError(e.message);
                  load();
                  loadLog();
                  setReload((r) => r + 1);
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ChampionshipView seasonId={seasonId} reloadKey={reload} />

      {/* registro */}
      <details className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
        <summary className="cursor-pointer font-semibold">Registro delle modifiche ({log.length})</summary>
        <ul className="mt-2 flex flex-col gap-1">
          {log.map((l) => (
            <li key={l.id} className="rounded bg-night/30 px-2 py-1">
              <span className="text-muted-foreground">{eventDate(l.created_at)}</span> · <strong>{l.action}</strong>
              {l.profiles?.username ? ` · ${l.profiles.username}` : ""}
              <span className="block break-words text-muted-foreground">{JSON.stringify(l.detail)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function OverrideForm({
  teams,
  roster,
  onSubmit,
  busy,
}: {
  teams: TeamRow[];
  roster: { id: string; name: string }[];
  onSubmit: (args: { p_team: string | null; p_character: string | null; p_status: string; p_reason: string }) => void;
  busy: boolean;
}) {
  const [who, setWho] = useState("");
  const [status, setStatus] = useState("qualificato");
  const [reason, setReason] = useState("");
  const [kind, id] = who.split(":");
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      Eccezione:
      <select className={cn(inputClass, "h-8 w-52")} value={who} onChange={(e) => setWho(e.target.value)}>
        <option value="">Squadra o atleta…</option>
        <optgroup label="Squadre">
          {teams.map((t) => (
            <option key={t.team_id} value={`t:${t.team_id}`}>
              {t.name}
            </option>
          ))}
        </optgroup>
        {roster.length > 0 && (
          <optgroup label="Atleti (qualificazione individuale)">
            {roster.map((r) => (
              <option key={r.id} value={`c:${r.id}`}>
                {r.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <select className={cn(inputClass, "h-8 w-32")} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="qualificato">Inserisci</option>
        <option value="escluso">Escludi</option>
      </select>
      <input className={cn(inputClass, "h-8 min-w-0 flex-1")} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (obbligatorio)" />
      <Button
        type="button"
        size="xs"
        disabled={busy || !who || reason.trim().length < 5}
        onClick={() => {
          onSubmit({ p_team: kind === "t" ? id : null, p_character: kind === "c" ? id : null, p_status: status, p_reason: reason.trim() });
          setReason("");
        }}
      >
        Salva
      </Button>
    </div>
  );
}

function AdjustmentForm({ teams, seasonId, onDone }: { teams: TeamRow[]; seasonId: string; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({ team: "", points: 0, tiebreak: 0, note: "" });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    const { error: e } = await supabase.from("sport_standing_adjustments").insert({ season_id: seasonId, team_id: f.team, points: f.points, tiebreak: f.tiebreak, note: f.note.trim() });
    if (e) return setError(e.message);
    setF({ team: "", points: 0, tiebreak: 0, note: "" });
    onDone();
  }
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
      <h4 className="font-semibold">Penalità, bonus e spareggi</h4>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select className={cn(inputClass, "h-8 w-48")} value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })}>
          <option value="">Squadra…</option>
          {teams.map((t) => (
            <option key={t.team_id} value={t.team_id}>
              {t.name}
            </option>
          ))}
        </select>
        punti
        <input type="number" min={-100} max={100} className={cn(inputClass, "h-8 w-16")} value={f.points} onChange={(e) => setF({ ...f, points: Number(e.target.value) })} />
        spareggio
        <input type="number" min={-100} max={100} className={cn(inputClass, "h-8 w-16")} value={f.tiebreak} onChange={(e) => setF({ ...f, tiebreak: Number(e.target.value) })} />
        <input className={cn(inputClass, "h-8 min-w-0 flex-1")} value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Motivo (obbligatorio)" />
        <Button type="button" size="xs" disabled={!f.team || f.note.trim().length < 3 || (f.points === 0 && f.tiebreak === 0)} onClick={save}>
          Aggiungi
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">I punti si sommano alla classifica (negativi = penalità). Lo spareggio decide solo a parità di tutto il resto: vince chi ha il numero più alto.</p>
    </section>
  );
}

function RulesEditor({ seasonId, rules, race, onSaved }: { seasonId: string; rules: ChampRules; race: boolean; onSaved: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState(() => ({
    ...rules,
    placement: rules.placement_points.join(", "),
    grades: rules.individual_grade_points.join(", "),
    tb: [...rules.tiebreakers, "", "", "", ""].slice(0, 4),
  }));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const list = (v: string) =>
    v
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n));

  async function save() {
    setError(null);
    setSaved(false);
    const { error: e } = await supabase
      .from("sport_season_rules")
      .update({
        pts_win: f.pts_win,
        pts_draw: f.pts_draw,
        pts_loss: f.pts_loss,
        placement_points: list(f.placement),
        regular_rounds: f.regular_rounds,
        nonconf_games: f.nonconf_games,
        race_meets: f.race_meets,
        nationals_others: f.nationals_others,
        min_events: f.min_events,
        nationals_threshold: f.nationals_threshold,
        nationals_slots: f.nationals_slots,
        conference_teams: f.conference_teams,
        conference_champion_auto: f.conference_champion_auto,
        conference_min_place: f.conference_min_place || null,
        tiebreakers: f.tb.filter((x, i, a) => x && a.indexOf(x) === i),
        individual_enabled: f.individual_enabled,
        individual_grade_points: list(f.grades),
        individual_threshold: f.individual_threshold,
        individual_min_events: f.individual_min_events,
        individual_slots: f.individual_slots,
      })
      .eq("season_id", seasonId);
    if (e) return setError(e.message);
    setSaved(true);
    onSaved();
  }

  const n = (key: keyof ChampRules, label: string, hint?: string) => (
    <label className="flex flex-col gap-0.5 text-xs">
      {label}
      <input
        type="number"
        className={cn(inputClass, "h-8")}
        value={(f[key] as number | null) ?? ""}
        onChange={(e) => setF({ ...f, [key]: num(e.target.value) })}
        title={hint}
      />
    </label>
  );

  return (
    <details className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <summary className="cursor-pointer font-semibold">Regole della stagione</summary>
      <p className="mt-1 text-xs text-muted-foreground">Valgono solo per questa stagione: cambiarle non tocca le stagioni passate. Ogni modifica va nel registro.</p>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {!race && n("pts_win", "Punti vittoria")}
        {!race && n("pts_draw", "Punti pareggio")}
        {!race && n("pts_loss", "Punti sconfitta")}
        {!race && n("regular_rounds", "Partite con ogni rivale", "Per il calendario automatico: 2 = andata e ritorno")}
        {!race && n("nonconf_games", "Partite fuori Conference", "Contro le università nazionali, all'inizio della stagione")}
        {race && n("race_meets", "Meeting in stagione", "Per il calendario automatico")}
        {race && (
          <label className="col-span-2 flex flex-col gap-0.5 text-xs">
            Punti per piazzamento (1°, 2°, 3°…)
            <input className={cn(inputClass, "h-8")} value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value })} />
          </label>
        )}
        {n("min_events", "Gare minime")}
        {n("nationals_threshold", "Soglia Nationals (punti)")}
        {n("nationals_slots", "Posti ai Nationals")}
        {n("nationals_others", "Posti per le altre Conference", "Le università nazionali più forti, qualificate d'ufficio")}
        {n("conference_teams", "Squadre al torneo di Conference", "0 = tutte")}
        {n("conference_min_place", "Piazzamento minimo in Conference", "0 = nessun vincolo")}
        <label className="col-span-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={f.conference_champion_auto} onChange={(e) => setF({ ...f, conference_champion_auto: e.target.checked })} />
          Il campione di Conference va ai Nationals di diritto
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        Spareggi, in ordine:
        {f.tb.map((v, i) => (
          <select
            key={i}
            className={cn(inputClass, "h-8 w-44")}
            value={v}
            onChange={(e) => setF({ ...f, tb: f.tb.map((x, k) => (k === i ? e.target.value : x)) })}
          >
            <option value="">—</option>
            {Object.entries(TIEBREAK_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 flex items-center gap-2 text-xs sm:col-span-4">
          <input type="checkbox" checked={f.individual_enabled} onChange={(e) => setF({ ...f, individual_enabled: e.target.checked })} />
          Qualificazione individuale (gli atleti possono andare ai Nationals anche senza la squadra)
        </label>
        {f.individual_enabled && (
          <>
            <label className="col-span-2 flex flex-col gap-0.5 text-xs">
              Punti per voto (voto 1, 2, … 10)
              <input className={cn(inputClass, "h-8")} value={f.grades} onChange={(e) => setF({ ...f, grades: e.target.value })} />
            </label>
            {n("individual_threshold", "Soglia individuale")}
            {n("individual_min_events", "Gare minime (individuale)")}
            {n("individual_slots", "Posti individuali")}
          </>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button type="button" size="sm" onClick={save}>
          Salva le regole
        </Button>
        {saved && <span className="text-xs text-mint">Salvate.</span>}
      </div>
    </details>
  );
}
