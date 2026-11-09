// Lavori e gruppi: tipi e tabelle, usati da server e browser.

export type OrgKind = "job" | "group";
export type JobKind = "full_time" | "part_time";

export type OrgRole = {
  id: string;
  name: string;
  description: string;
  /** Gruppi: stipendio mensile (0 = nessuno) */
  salary: number;
  /** Lavori: paga mensile full time / part time (null = non previsto) */
  salary_full: number | null;
  salary_part: number | null;
  /** Posti del ruolo (null = senza limite) */
  max_members: number | null;
  /** Lavori: il giocatore può sceglierlo da solo. Gruppi: sempre false */
  self_select: boolean;
  sort_order: number;
};

export type OrgMember = {
  character_id: string;
  name: string;
  avatar_url: string | null;
  role_id: string;
  /** Lavori: orario scelto */
  mode: JobKind | null;
  /** Squadre: è il capitano */
  captain?: boolean;
};

export type Org = {
  id: string;
  name: string;
  description: string;
  /** Solo i gruppi: squadra di uno sport (si entra dalla pagina Sport, la gestisce Gestione → Sport) */
  sport: boolean;
  /** Icona (link https, circa 20x20) */
  icon_url: string | null;
  /** Solo i gruppi: tag, es. "malavita" (vede il mercato nero) */
  tags: string[];
  /** Solo i gruppi: ambito (una scheda in Utility → Gruppi) */
  category_id: string | null;
  /** Solo i gruppi: nascosto (lo vedono solo i membri e lo staff) */
  hidden: boolean;
  /** Solo i lavori: ambito (una linguetta in Utility → Lavori) */
  area: JobArea;
  sort_order: number;
  active: boolean;
  roles: OrgRole[];
  members: OrgMember[];
};

/** Ambito dei gruppi (Gruppi cittadini, Club e Fratellanze…) */
export type GroupCategory = {
  id: string;
  name: string;
  /** qui finiscono le squadre sportive */
  for_sport: boolean;
  /** gruppi di questo ambito per personaggio (null = senza limite) */
  max_per_character: number | null;
  sort_order: number;
};

/** Tabelle del database per lavori e gruppi */
export const ORG_TABLES = {
  job: { org: "jobs", role: "job_roles", member: "character_jobs", fk: "job_id" },
  group: { org: "game_groups", role: "group_roles", member: "character_groups", fk: "group_id" },
} as const;

export const ORG_LABELS = {
  job: { one: "lavoro", many: "Lavori", permission: "lavori.gestire" },
  group: { one: "gruppo", many: "Gruppi", permission: "gruppi.gestire" },
} as const;

/** Ambiti dei lavori (jobs.area), nell'ordine delle linguette */
export type JobArea = "college" | "attivita" | "indipendente";
export const JOB_AREAS: { value: JobArea; label: string }[] = [
  { value: "college", label: "Nel college" },
  { value: "attivita", label: "Locali e attività" },
  { value: "indipendente", label: "Lavori indipendenti" },
];
export const isJobArea = (v: unknown): v is JobArea => v === "college" || v === "attivita" || v === "indipendente";

export const JOB_KIND_LABEL: Record<JobKind, string> = { full_time: "Full time", part_time: "Part time" };
