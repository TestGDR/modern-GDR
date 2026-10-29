// Lavori e gruppi: tipi e tabelle, usati da server e browser.

export type OrgKind = "job" | "group";
export type JobKind = "full_time" | "part_time";

export type OrgRole = {
  id: string;
  name: string;
  description: string;
  /** Stipendio di una quota (0 = nessuno) */
  salary: number;
  /** Lavori: il giocatore può sceglierlo da solo. Gruppi: sempre false */
  self_select: boolean;
  sort_order: number;
};

export type OrgMember = {
  character_id: string;
  name: string;
  avatar_url: string | null;
  role_id: string;
};

export type Org = {
  id: string;
  name: string;
  description: string;
  /** Solo i lavori */
  kind: JobKind | null;
  sort_order: number;
  active: boolean;
  roles: OrgRole[];
  members: OrgMember[];
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

export const JOB_KIND_LABEL: Record<JobKind, string> = { full_time: "Full time", part_time: "Part time" };
