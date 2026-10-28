// Caratteristiche del personaggio (stesse regole del database:
// ognuna da 1 a 10, massimo 28 punti in totale).

export const STATS = [
  { key: "physique", label: "Fisico" },
  { key: "cunning", label: "Astuzia" },
  { key: "charisma", label: "Carisma" },
  { key: "driving", label: "Guida" },
] as const;

export type StatKey = (typeof STATS)[number]["key"];

export const STAT_KEYS: StatKey[] = STATS.map((s) => s.key);
export const STATS_BUDGET = 28;
export const STAT_MIN = 1;
export const STAT_MAX = 10;
