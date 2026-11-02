import type { SportEvent, SportFormat, SportPhase, SportSeasonKind, SquadStatus } from "@/lib/types";

// Testi dello sport condivisi da pagina Sport, calendario e gestione.
// Regole e numeri stanno nel database (game_settings sport_*): qui solo la presentazione.

export const SEASON_LABEL: Record<SportSeasonKind, string> = { fall: "Autunno", winter: "Inverno", spring: "Primavera", year_round: "Tutto l'anno" };
export const FORMAT_LABEL: Record<SportFormat, string> = {
  team_match: "Partite tra squadre",
  individual_match: "Incontri uno contro uno",
  team_race: "Gare di equipaggi",
  individual_race: "Gare individuali",
};
export const PHASE_LABEL: Record<SportPhase, string> = {
  friendly: "Amichevole",
  regular: "Stagione regolare",
  conference: "Torneo di Conference",
  national: "Torneo nazionale",
};
export const SQUAD_LABEL: Record<SquadStatus, string> = { starter: "Titolare", reserve: "Riserva", captain: "Capitano", redshirt: "Redshirt" };
export const INTENSITY_LABEL = { light: "Leggera", normal: "Normale", intense: "Intensa" } as const;
export const EVENT_STATUS_LABEL: Record<SportEvent["status"], string> = {
  scheduled: "In programma",
  postponed: "Rinviato",
  cancelled: "Annullato",
  simulated: "Da pubblicare",
  published: "Concluso",
};
export const VENUE_LABEL: Record<SportEvent["venue"], string> = { home: "In casa", away: "In trasferta", neutral: "Campo neutro" };
export const EVENT_KINDS: SportEvent["kind"][] = ["partita", "incontro", "gara", "regata", "meeting", "torneo"];

/** Data e ora in italiano (ora italiana) */
export function eventDate(iso: string) {
  return new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Pezzi di un tiro di allenamento (dal database) */
export type TrainingParts = {
  code?: string | null;
  attr?: number | null;
  skillName?: string | null;
  skill?: number | null;
  d10: number;
  crit: string;
  extra: number | null;
  mods?: number | null;
};

/** Valore del dado: 10 → +secondo d10, 1 → −secondo d10 */
export function dieValue(p: Pick<TrainingParts, "d10" | "crit" | "extra">) {
  if (p.crit === "success" && p.extra !== null) return p.d10 + p.extra;
  if (p.crit === "failure" && p.extra !== null) return p.d10 - p.extra;
  return p.d10;
}

const signed = (n: number) => (n < 0 ? `− ${-n}` : `+ ${n}`);

/** "VIG 10 + Nuoto 3 + d10 (1 − 6 = −5) − 1 modificatori = 7" */
export function trainingFormula(p: TrainingParts) {
  const die =
    p.crit === "success" && p.extra !== null
      ? `d10 (${p.d10} + ${p.extra}, critico)`
      : p.crit === "failure" && p.extra !== null
        ? `d10 (${p.d10} − ${p.extra} = ${dieValue(p)}, fallimento critico)`
        : `d10 ${p.d10}`;
  const parts = [`${p.code ?? "Car."} ${p.attr ?? "?"}`, `${signed(p.skill ?? 0)} ${p.skillName ?? "abilità"}`, `+ ${die}`];
  if (p.mods) parts.push(`${signed(p.mods)} modificatori`);
  const total = (p.attr ?? 0) + (p.skill ?? 0) + dieValue(p) + (p.mods ?? 0);
  return `${parts.join(" ")} = ${total}`;
}
