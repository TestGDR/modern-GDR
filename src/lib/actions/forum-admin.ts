"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/actions/admin";
import type { ForumAccess } from "@/lib/types";
import { requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Gestione → Forum: sezioni (On Game / Off Game) e bacheche.
// Il permesso forum.sezioni lo controllano le policy del database.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type DbError = { message: string; code?: string } | null;

async function run(fn: (supabase: Supabase) => PromiseLike<{ error: DbError }>): Promise<ActionResult> {
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Esiste già una bacheca con questo nome." };
    if (error.code === "42501") return { ok: false, error: "Non hai il permesso di gestire il forum." };
    if (error.code === "23514") return { ok: false, error: "Un valore non è valido: controlla i campi." };
    return { ok: false, error: error.message };
  }
  refresh();
  return { ok: true };
}

/** Indirizzo della bacheca dal nome: "Il bar degli utenti" → "il-bar-degli-utenti" */
function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function saveForumSection(input: { id?: string; title: string; isOnGame: boolean }): Promise<ActionResult> {
  const title = input.title.trim().slice(0, 60);
  if (title.length < 2) return { ok: false, error: "Il nome della sezione deve avere almeno 2 caratteri." };
  return run(async (supabase) => {
    if (input.id) return supabase.from("forum_sections").update({ title, is_on_game: input.isOnGame }).eq("id", input.id);
    const { count } = await supabase.from("forum_sections").select("id", { count: "exact", head: true });
    return supabase.from("forum_sections").insert({ title, is_on_game: input.isOnGame, sort_order: (count ?? 0) + 1 });
  });
}

/** Eliminando una sezione si eliminano anche le sue bacheche e discussioni */
export async function deleteForumSection(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Sezione non valida." };
  return run((supabase) => supabase.from("forum_sections").delete().eq("id", id).then((r) => r));
}

export async function saveForumBoard(input: {
  id?: string;
  sectionId: string;
  name: string;
  description: string;
  staffOnly: boolean;
  access: ForumAccess;
  levelIds: string[];
  groupIds: string[];
}): Promise<ActionResult> {
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) return { ok: false, error: "Il nome della sezione deve avere almeno 2 caratteri." };
  if (!isUuid(input.sectionId)) return { ok: false, error: "Scegli la categoria." };
  if (!["pubblica", "livelli", "gruppi"].includes(input.access)) return { ok: false, error: "Scegli chi può leggere la sezione." };
  const levelIds = input.access === "livelli" ? input.levelIds.filter(isUuid) : [];
  const groupIds = input.access === "gruppi" ? input.groupIds.filter(isUuid) : [];
  if (input.access === "livelli" && levelIds.length === 0) return { ok: false, error: "Scegli almeno un livello." };
  if (input.access === "gruppi" && groupIds.length === 0) return { ok: false, error: "Scegli almeno un gruppo." };
  const row = {
    section_id: input.sectionId,
    name,
    description: input.description.trim().slice(0, 300) || null,
    staff_only: input.staffOnly,
    access: input.access,
    level_ids: levelIds,
    group_ids: groupIds,
  };
  return run(async (supabase) => {
    if (input.id) return supabase.from("forum_boards").update(row).eq("id", input.id);
    const base = slugify(name) || "bacheca";
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const { count } = await supabase.from("forum_boards").select("id", { count: "exact", head: true }).eq("slug", slug);
      if (!count) break;
      slug = `${base}-${i}`;
    }
    const { count } = await supabase.from("forum_boards").select("id", { count: "exact", head: true }).eq("section_id", input.sectionId);
    return supabase.from("forum_boards").insert({ ...row, slug, sort_order: (count ?? 0) + 1 });
  });
}

/** Eliminando una bacheca si eliminano anche le sue discussioni */
export async function deleteForumBoard(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Bacheca non valida." };
  return run((supabase) => supabase.from("forum_boards").delete().eq("id", id).then((r) => r));
}

export async function moveForumItem(table: "forum_sections" | "forum_boards", id: string, direction: -1 | 1): Promise<ActionResult> {
  if (!isUuid(id) || !["forum_sections", "forum_boards"].includes(table)) return { ok: false, error: "Voce non valida." };
  return run(async (supabase) => {
    const { data: item } = await supabase.from(table).select("*").eq("id", id).maybeSingle<Record<string, string>>();
    if (!item) return { error: { message: "Voce non trovata." } };
    let query = supabase.from(table).select("id").order("sort_order");
    if (table === "forum_boards") query = query.eq("section_id", item.section_id);
    const { data } = await query.overrideTypes<{ id: string }[], { merge: false }>();
    const ids = (data ?? []).map((x) => x.id);
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
