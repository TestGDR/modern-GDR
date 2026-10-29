"use server";

import { refresh } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Scritture del pannello di gestione. Ogni operazione passa dal client
// dell'utente collegato: i permessi li verificano le policy del database.

export type ActionResult = { ok: boolean; error?: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function run(
  fn: (supabase: Supabase) => PromiseLike<{ error: { message: string; code?: string } | null }>,
): Promise<ActionResult> {
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) return { ok: false, error: friendly(error) };
  refresh();
  return { ok: true };
}

function friendly(error: { message: string; code?: string }) {
  if (error.code === "23505") return "Esiste già una voce con questo nome o questa sigla.";
  if (error.code === "42501") return "Non hai il permesso per questa operazione.";
  if (error.code === "23514") return "Un valore non è valido: controlla i campi.";
  return error.message;
}

const clean = (v: string | null | undefined, max: number) => (v ?? "").trim().slice(0, max);

/* ------------------------------ Riordino ------------------------------ */

type OrderedTable = "attributes" | "skills" | "creation_options" | "sheet_options";

/**
 * Sposta una voce su o giù tra le sue "sorelle" (stessa caratteristica,
 * stesso tipo…) e rinumera l'ordine da 1.
 */
export async function moveItem(table: OrderedTable, id: string, direction: -1 | 1): Promise<ActionResult> {
  if (!isUuid(id) || !["attributes", "skills", "creation_options", "sheet_options"].includes(table)) {
    return { ok: false, error: "Voce non valida." };
  }
  return run(async (supabase) => {
    const { data: item } = await supabase.from(table).select("*").eq("id", id).maybeSingle<Record<string, string>>();
    if (!item) return { error: { message: "Voce non trovata." } };
    let query = supabase.from(table).select("id").order("sort_order").order("name");
    if (table === "skills") query = query.eq("attribute_id", item.attribute_id);
    if (table === "creation_options" || table === "sheet_options") query = query.eq("kind", item.kind);
    const { data: siblings } = await query.overrideTypes<{ id: string }[], { merge: false }>();
    const ids = (siblings ?? []).map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= ids.length) return { error: null };
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [index, rowId] of ids.entries()) {
      const { error } = await supabase.from(table).update({ sort_order: index + 1 }).eq("id", rowId);
      if (error) return { error };
    }
    return { error: null };
  });
}

/* ------------------------------ Caratteristiche ------------------------------ */

export type AttributeInput = { id?: string; code: string; name: string; description: string; active: boolean };

export async function saveAttribute(input: AttributeInput): Promise<ActionResult> {
  const code = clean(input.code, 6).toUpperCase();
  const name = clean(input.name, 40);
  if (!/^[A-Z][A-Z0-9]{1,5}$/.test(code)) return { ok: false, error: "La sigla deve avere da 2 a 6 lettere maiuscole (es. INT)." };
  if (name.length < 2) return { ok: false, error: "Scrivi il nome della caratteristica." };
  const row = { code, name, description: clean(input.description, 500), active: input.active };
  return run(async (supabase) => {
    if (input.id) return supabase.from("attributes").update(row).eq("id", input.id);
    const { count } = await supabase.from("attributes").select("id", { count: "exact", head: true });
    return supabase.from("attributes").insert({ ...row, sort_order: (count ?? 0) + 1 });
  });
}

export async function deleteAttribute(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Voce non valida." };
  return run((supabase) => supabase.from("attributes").delete().eq("id", id).then((r) => r));
}

/* ------------------------------ Abilità ------------------------------ */

export type SkillInput = {
  id?: string;
  attributeId: string;
  name: string;
  description: string;
  category: string | null;
  active: boolean;
};

const CATEGORIES = ["Studio", "Sport", "Arti", "Sociale", "Pratico"];

export async function saveSkill(input: SkillInput): Promise<ActionResult> {
  const name = clean(input.name, 60);
  if (name.length < 2) return { ok: false, error: "Scrivi il nome dell'abilità." };
  if (!isUuid(input.attributeId)) return { ok: false, error: "Scegli la caratteristica collegata." };
  const row = {
    attribute_id: input.attributeId,
    name,
    description: clean(input.description, 500),
    category: input.category && CATEGORIES.includes(input.category) ? input.category : null,
    active: input.active,
  };
  return run(async (supabase) => {
    if (input.id) return supabase.from("skills").update(row).eq("id", input.id);
    const { count } = await supabase.from("skills").select("id", { count: "exact", head: true }).eq("attribute_id", input.attributeId);
    return supabase.from("skills").insert({ ...row, sort_order: (count ?? 0) + 1 });
  });
}

export async function deleteSkill(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Voce non valida." };
  return run((supabase) => supabase.from("skills").delete().eq("id", id).then((r) => r));
}

/* --------------------- Vantaggi, svantaggi, tratti e tenore --------------------- */

export type OptionInput = {
  id?: string;
  kind: "vantaggio" | "svantaggio" | "tratto" | "tenore";
  name: string;
  costPx: number;
  description: string;
  rollModifier: number | null;
  rollSkillId: string | null;
  incompatibleIds: string[];
  /** Patrimonio: entrata, mantenimento e quota iniziale */
  salary: number;
  upkeep: number;
  initialAmount: number;
  active: boolean;
};

export async function saveOption(input: OptionInput): Promise<ActionResult> {
  const name = clean(input.name, 60);
  if (name.length < 2) return { ok: false, error: "Scrivi il nome della voce." };
  if (!["vantaggio", "svantaggio", "tratto", "tenore"].includes(input.kind)) return { ok: false, error: "Tipo non valido." };
  if (!Number.isInteger(input.costPx) || Math.abs(input.costPx) > 1000) return { ok: false, error: "Il costo deve essere un numero intero tra -1000 e 1000." };
  if (!Number.isInteger(input.salary) || input.salary < 0 || input.salary > 1000000) return { ok: false, error: "L'entrata va da 0 a 1.000.000." };
  if (!Number.isInteger(input.upkeep) || input.upkeep < 0 || input.upkeep > 1000000) return { ok: false, error: "Il mantenimento va da 0 a 1.000.000." };
  if (!Number.isInteger(input.initialAmount) || input.initialAmount < 0 || input.initialAmount > 100000000) return { ok: false, error: "La quota iniziale va da 0 a 100.000.000." };
  if (input.rollModifier !== null && (!Number.isInteger(input.rollModifier) || Math.abs(input.rollModifier) > 3)) {
    return { ok: false, error: "L'effetto sui tiri va da -3 a +3." };
  }
  const row = {
    kind: input.kind,
    name,
    cost_px: input.costPx,
    description: clean(input.description, 500),
    roll_modifier: input.rollModifier,
    roll_skill_id: input.rollSkillId && isUuid(input.rollSkillId) ? input.rollSkillId : null,
    incompatible_ids: input.incompatibleIds.filter((i) => isUuid(i) && i !== input.id),
    salary: input.kind === "tenore" ? input.salary : 0,
    upkeep: input.kind === "tenore" ? input.upkeep : 0,
    initial_amount: input.kind === "tenore" ? input.initialAmount : 0,
    active: input.active,
  };
  return run(async (supabase) => {
    if (input.id) return supabase.from("creation_options").update(row).eq("id", input.id);
    const { count } = await supabase.from("creation_options").select("id", { count: "exact", head: true }).eq("kind", input.kind);
    return supabase.from("creation_options").insert({ ...row, sort_order: (count ?? 0) + 1 });
  });
}

export async function deleteOption(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Voce non valida." };
  return run(async (supabase) => {
    const { count } = await supabase.from("character_options").select("option_id", { count: "exact", head: true }).eq("option_id", id);
    if (count) return { error: { message: "Questa voce è stata scelta da qualche personaggio: non si elimina, si disattiva." } };
    return supabase.from("creation_options").delete().eq("id", id);
  });
}

/* ------------------------------ Elenchi della scheda ------------------------------ */

export async function saveSheetOption(input: { id?: string; kind: "indirizzo" | "anno" | "club"; name: string; active: boolean }): Promise<ActionResult> {
  const name = clean(input.name, 60);
  if (name.length < 2) return { ok: false, error: "Scrivi il nome della voce." };
  if (!["indirizzo", "anno", "club"].includes(input.kind)) return { ok: false, error: "Elenco non valido." };
  return run(async (supabase) => {
    if (input.id) return supabase.from("sheet_options").update({ name, active: input.active }).eq("id", input.id);
    const { count } = await supabase.from("sheet_options").select("id", { count: "exact", head: true }).eq("kind", input.kind);
    return supabase.from("sheet_options").insert({ kind: input.kind, name, active: input.active, sort_order: (count ?? 0) + 1 });
  });
}

/* ------------------------------ Impostazioni ------------------------------ */

export async function saveSetting(key: string, value: number | number[] | string): Promise<ActionResult> {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) return { ok: false, error: "Impostazione non valida." };
  return run((supabase) => supabase.from("game_settings").update({ value }).eq("key", key).then((r) => r));
}

/* ------------------------------ Livelli ------------------------------ */

export type LevelInput = {
  id?: string;
  name: string;
  description: string;
  color: string | null;
  rank: number;
  permissions: string[];
  maxCharacters: number;
};

export async function saveLevel(input: LevelInput): Promise<ActionResult & { id?: string }> {
  const name = clean(input.name, 40);
  if (name.length < 2) return { ok: false, error: "Scrivi il nome del livello." };
  if (!Number.isInteger(input.rank) || input.rank < 0 || input.rank > 999) return { ok: false, error: "Il rango va da 0 a 999." };
  if (input.color && !/^#[0-9a-fA-F]{6}$/.test(input.color)) return { ok: false, error: "Colore non valido." };
  if (!Number.isInteger(input.maxCharacters) || input.maxCharacters < 0 || input.maxCharacters > 20) {
    return { ok: false, error: "Il numero massimo di personaggi va da 0 a 20." };
  }
  const row = {
    name,
    description: clean(input.description, 300),
    color: input.color || null,
    rank: input.rank,
    permissions: [...new Set(input.permissions.filter((p) => /^[a-z_.]{3,60}$/.test(p)))],
    max_characters: input.maxCharacters,
  };
  await requirePlayer();
  const supabase = await createClient();
  if (input.id) {
    const { error } = await supabase.from("user_levels").update(row).eq("id", input.id);
    if (error) return { ok: false, error: friendly(error) };
    refresh();
    return { ok: true, id: input.id };
  }
  const { data, error } = await supabase.from("user_levels").insert(row).select("id").single<{ id: string }>();
  if (error || !data) return { ok: false, error: error ? friendly(error) : "Livello non creato." };
  refresh();
  return { ok: true, id: data.id };
}

/** Copia di un livello esistente (stessi permessi), da modificare */
export async function duplicateLevel(id: string): Promise<ActionResult & { id?: string }> {
  if (!isUuid(id)) return { ok: false, error: "Livello non valido." };
  await requirePlayer();
  const supabase = await createClient();
  const { data: source } = await supabase.from("user_levels").select("*").eq("id", id).maybeSingle<{
    name: string; description: string; color: string | null; rank: number; permissions: string[]; max_characters: number; is_admin: boolean;
  }>();
  if (!source) return { ok: false, error: "Livello non trovato." };
  return saveLevel({
    name: `${source.name} (copia)`.slice(0, 40),
    description: source.description,
    color: source.color,
    rank: source.is_admin ? 900 : Math.max(0, source.rank - 1),
    permissions: source.permissions,
    maxCharacters: source.max_characters,
  });
}

export async function deleteLevel(id: string, moveTo: string): Promise<ActionResult> {
  if (!isUuid(id) || !isUuid(moveTo)) return { ok: false, error: "Scegli dove spostare gli utenti." };
  return run((supabase) => supabase.rpc("delete_level", { p_level: id, p_move_to: moveTo }).then((r) => r));
}

export async function assignLevel(userId: string, levelId: string): Promise<ActionResult> {
  if (!isUuid(userId) || !isUuid(levelId)) return { ok: false, error: "Dati non validi." };
  return run((supabase) => supabase.rpc("assign_level", { p_user: userId, p_level: levelId }).then((r) => r));
}
