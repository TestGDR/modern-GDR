"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/actions/admin";
import { requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { ORG_TABLES, type JobKind, type OrgKind } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

// Lavori e gruppi: pannello di gestione (permessi nelle policy) e scelta
// dei lavori da parte dei giocatori (funzioni join_job / leave_job).

type DbError = { message: string; code?: string } | null;

function result(error: DbError): ActionResult {
  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: false, error: "Esiste già una voce con questo nome." };
  if (error.code === "42501") return { ok: false, error: "Non hai il permesso per questa operazione." };
  if (error.code === "P0001") return { ok: false, error: error.message };
  if (error.code === "23514") return { ok: false, error: "Un valore non è valido: controlla i campi." };
  return { ok: false, error: "Operazione non riuscita. Riprova." };
}

const clean = (v: string, max: number) => v.trim().slice(0, max);
const validKind = (k: string): k is OrgKind => k === "job" || k === "group";

async function done(error: DbError) {
  if (!error) refresh();
  return result(error);
}

/** Nessuna riga toccata = niente permesso (la RLS filtra in silenzio) */
async function checked(query: PromiseLike<{ data: unknown[] | null; error: DbError }>) {
  const { data, error } = await query;
  if (!error && !data?.length) return { ok: false, error: "Non hai il permesso per questa operazione." };
  return done(error);
}

/* ------------------------------ Lavori e gruppi ------------------------------ */

export type OrgInput = {
  id?: string;
  name: string;
  description: string;
  iconUrl?: string;
  active: boolean;
  /** gruppi: tag (es. malavita) */
  tags?: string[];
  /** gruppi: ambito */
  categoryId?: string | null;
  /** gruppi: nascosto (niente icona in scheda e online, lo vedono solo membri e staff) */
  hidden?: boolean;
};

export async function saveOrg(kind: OrgKind, input: OrgInput): Promise<ActionResult> {
  if (!validKind(kind)) return { ok: false, error: "Tipo non valido." };
  const name = clean(input.name, 60);
  if (name.length < 2) return { ok: false, error: "Scrivi il nome." };
  const t = ORG_TABLES[kind];
  const icon = (input.iconUrl ?? "").trim();
  if (icon && (!/^https:\/\/\S+$/.test(icon) || icon.length > 500)) return { ok: false, error: "L'icona va indicata con un link che inizia con https://" };
  const row: Record<string, unknown> = { name, description: clean(input.description, 20000), active: input.active, icon_url: icon || null };
  // gruppi: solo tag conosciuti ("malavita" apre il mercato nero)
  if (kind === "group" && input.tags) row.tags = input.tags.filter((t) => t === "malavita");
  if (kind === "group") row.category_id = input.categoryId && isUuid(input.categoryId) ? input.categoryId : null;
  if (kind === "group" && typeof input.hidden === "boolean") row.hidden = input.hidden;
  await requirePlayer();
  const supabase = await createClient();
  if (input.id) {
    if (!isUuid(input.id)) return { ok: false, error: "Voce non valida." };
    return checked(supabase.from(t.org).update(row).eq("id", input.id).select("id"));
  }
  const { count } = await supabase.from(t.org).select("id", { count: "exact", head: true });
  const { error } = await supabase.from(t.org).insert({ ...row, sort_order: (count ?? 0) + 1 });
  return done(error);
}

export async function deleteOrg(kind: OrgKind, id: string): Promise<ActionResult> {
  if (!validKind(kind) || !isUuid(id)) return { ok: false, error: "Voce non valida." };
  await requirePlayer();
  const supabase = await createClient();
  return checked(supabase.from(ORG_TABLES[kind].org).delete().eq("id", id).select("id"));
}

/** Sposta su o giù un lavoro/gruppo (o un ruolo, con parentId) */
export async function moveOrgItem(kind: OrgKind, id: string, direction: -1 | 1, parentId?: string): Promise<ActionResult> {
  if (!validKind(kind) || !isUuid(id) || (parentId !== undefined && !isUuid(parentId))) return { ok: false, error: "Voce non valida." };
  const t = ORG_TABLES[kind];
  const table = parentId ? t.role : t.org;
  await requirePlayer();
  const supabase = await createClient();
  let query = supabase.from(table).select("id").order("sort_order").order("name");
  if (parentId) query = query.eq(t.fk, parentId);
  const { data } = await query.overrideTypes<{ id: string }[], { merge: false }>();
  const ids = (data ?? []).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (const [index, rowId] of ids.entries()) {
    const { error } = await supabase.from(table).update({ sort_order: index + 1 }).eq("id", rowId);
    if (error) return result(error);
  }
  refresh();
  return { ok: true };
}

/* ------------------------------ Ambiti dei gruppi ------------------------------ */

/** Crea o rinomina un ambito; "forSport" = ci vanno le squadre sportive (uno solo) */
export async function saveGroupCategory(input: { id?: string; name: string; forSport: boolean; maxPerCharacter?: number | null }): Promise<ActionResult> {
  const name = clean(input.name, 40);
  if (name.length < 2) return { ok: false, error: "Scrivi il nome dell'ambito." };
  const max = input.maxPerCharacter ?? null;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > 20)) return { ok: false, error: "Il massimo va da 1 a 20 (vuoto = senza limite)." };
  await requirePlayer();
  const supabase = await createClient();
  // un solo ambito per le squadre: si toglie agli altri
  if (input.forSport) {
    const { error } = await supabase.from("group_categories").update({ for_sport: false }).eq("for_sport", true).neq("id", input.id ?? "00000000-0000-0000-0000-000000000000");
    if (error) return result(error);
  }
  const row = { name, for_sport: input.forSport, max_per_character: max };
  if (input.id) {
    if (!isUuid(input.id)) return { ok: false, error: "Voce non valida." };
    return checked(supabase.from("group_categories").update(row).eq("id", input.id).select("id"));
  }
  const { count } = await supabase.from("group_categories").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("group_categories").insert({ ...row, sort_order: (count ?? 0) + 1 });
  return done(error);
}

export async function deleteGroupCategory(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Voce non valida." };
  await requirePlayer();
  const supabase = await createClient();
  return checked(supabase.from("group_categories").delete().eq("id", id).select("id"));
}

/** Nuovo ordine degli ambiti dopo il trascinamento */
export async function reorderGroupCategories(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0 || ids.length > 100 || !ids.every(isUuid) || new Set(ids).size !== ids.length) return { ok: false, error: "Ordine non valido." };
  await requirePlayer();
  const supabase = await createClient();
  for (const [index, rowId] of ids.entries()) {
    const { error } = await supabase.from("group_categories").update({ sort_order: index + 1 }).eq("id", rowId);
    if (error) return result(error);
  }
  refresh();
  return { ok: true };
}

/* ------------------------------ Ruoli ------------------------------ */

export type RoleInput = {
  id?: string;
  parentId: string;
  name: string;
  description: string;
  /** gruppi */
  salary: number;
  /** lavori: paga full time / part time (null = non previsto) */
  salaryFull: number | null;
  salaryPart: number | null;
  /** posti (null = senza limite) */
  maxMembers: number | null;
  selfSelect: boolean;
};

const validPay = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 1_000_000);

export async function saveOrgRole(kind: OrgKind, input: RoleInput): Promise<ActionResult> {
  if (!validKind(kind) || !isUuid(input.parentId)) return { ok: false, error: "Voce non valida." };
  const name = clean(input.name, 60);
  if (name.length < 2) return { ok: false, error: "Scrivi il nome del ruolo." };
  if (!Number.isInteger(input.salary) || input.salary < 0 || input.salary > 1_000_000) return { ok: false, error: "Lo stipendio va da 0 a 1.000.000." };
  if (!validPay(input.salaryFull) || !validPay(input.salaryPart)) return { ok: false, error: "Le paghe vanno da 0 a 1.000.000." };
  if (kind === "job" && input.salaryFull === null && input.salaryPart === null) return { ok: false, error: "Indica almeno la paga full time o quella part time." };
  if (input.maxMembers !== null && (!Number.isInteger(input.maxMembers) || input.maxMembers < 1 || input.maxMembers > 1000)) return { ok: false, error: "I posti vanno da 1 a 1000 (vuoto = senza limite)." };
  const t = ORG_TABLES[kind];
  const row: Record<string, unknown> = { name, description: clean(input.description, 2000), salary: kind === "group" ? input.salary : 0, max_members: input.maxMembers };
  if (kind === "job") {
    row.self_select = input.selfSelect;
    row.salary_full = input.salaryFull;
    row.salary_part = input.salaryPart;
  }
  await requirePlayer();
  const supabase = await createClient();
  if (input.id) {
    if (!isUuid(input.id)) return { ok: false, error: "Voce non valida." };
    return checked(supabase.from(t.role).update(row).eq("id", input.id).select("id"));
  }
  const { count } = await supabase.from(t.role).select("id", { count: "exact", head: true }).eq(t.fk, input.parentId);
  const { error } = await supabase.from(t.role).insert({ ...row, [t.fk]: input.parentId, sort_order: (count ?? 0) + 1 });
  return done(error);
}

export async function deleteOrgRole(kind: OrgKind, id: string): Promise<ActionResult> {
  if (!validKind(kind) || !isUuid(id)) return { ok: false, error: "Voce non valida." };
  await requirePlayer();
  const supabase = await createClient();
  return checked(supabase.from(ORG_TABLES[kind].role).delete().eq("id", id).select("id"));
}

/* ------------------------------ Membri (staff) ------------------------------ */

/** Assegna un personaggio (o gli cambia ruolo) */
export async function assignMember(kind: OrgKind, orgId: string, characterId: string, roleId: string, mode?: JobKind): Promise<ActionResult> {
  if (!validKind(kind) || !isUuid(orgId) || !isUuid(characterId) || !isUuid(roleId)) return { ok: false, error: "Scegli il personaggio e il ruolo." };
  if (kind === "job" && mode !== "full_time" && mode !== "part_time") return { ok: false, error: "Scegli full time o part time." };
  const t = ORG_TABLES[kind];
  const extra = kind === "job" ? { mode } : {};
  await requirePlayer();
  const supabase = await createClient();
  const { data: existing } = await supabase.from(t.member).select("role_id").eq("character_id", characterId).eq(t.fk, orgId).maybeSingle();
  if (existing) return checked(supabase.from(t.member).update({ role_id: roleId, ...extra }).eq("character_id", characterId).eq(t.fk, orgId).select("role_id"));
  const { error } = await supabase.from(t.member).insert({ character_id: characterId, [t.fk]: orgId, role_id: roleId, ...extra });
  return done(error);
}

export async function removeMember(kind: OrgKind, orgId: string, characterId: string): Promise<ActionResult> {
  if (!validKind(kind) || !isUuid(orgId) || !isUuid(characterId)) return { ok: false, error: "Voce non valida." };
  const t = ORG_TABLES[kind];
  await requirePlayer();
  const supabase = await createClient();
  return checked(supabase.from(t.member).delete().eq("character_id", characterId).eq(t.fk, orgId).select("role_id"));
}

/* ------------------------------ Giocatori: lavori ------------------------------ */

export async function joinJob(characterId: string, roleId: string, mode: JobKind): Promise<ActionResult> {
  if (!isUuid(characterId) || !isUuid(roleId) || (mode !== "full_time" && mode !== "part_time")) return { ok: false, error: "Voce non valida." };
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_job", { p_character: characterId, p_role: roleId, p_mode: mode });
  return done(error);
}

export async function leaveJob(characterId: string, jobId: string): Promise<ActionResult> {
  if (!isUuid(characterId) || !isUuid(jobId)) return { ok: false, error: "Voce non valida." };
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_job", { p_character: characterId, p_job: jobId });
  return done(error);
}
