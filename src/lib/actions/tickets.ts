"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/actions/admin";
import { requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Sezioni dei ticket (Gestione → Ticket). Il permesso ticket.categorie lo
// controllano le policy del database.

type DbError = { message: string; code?: string } | null;

async function run(fn: (supabase: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: DbError }>): Promise<ActionResult> {
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Esiste già una sezione con questo nome." };
    if (error.code === "42501") return { ok: false, error: "Non hai il permesso di gestire le sezioni dei ticket." };
    return { ok: false, error: error.message };
  }
  refresh();
  return { ok: true };
}

export async function saveTicketSection(input: { id?: string; name: string; instructions: string; active: boolean }): Promise<ActionResult> {
  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, error: "Scrivi il nome della sezione." };
  const row = { name, instructions: input.instructions.trim().slice(0, 4000), active: input.active };
  return run(async (supabase) => {
    if (input.id) return supabase.from("ticket_sections").update(row).eq("id", input.id);
    const { count } = await supabase.from("ticket_sections").select("id", { count: "exact", head: true });
    return supabase.from("ticket_sections").insert({ ...row, sort_order: (count ?? 0) + 1 });
  });
}

/** Eliminando una sezione i suoi ticket restano, "senza sezione" */
export async function deleteTicketSection(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Sezione non valida." };
  return run((supabase) => supabase.from("ticket_sections").delete().eq("id", id).then((r) => r));
}

export async function moveTicketSection(id: string, direction: -1 | 1): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Sezione non valida." };
  return run(async (supabase) => {
    const { data } = await supabase.from("ticket_sections").select("id").order("sort_order").order("name").overrideTypes<{ id: string }[], { merge: false }>();
    const ids = (data ?? []).map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= ids.length) return { error: null };
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [index, rowId] of ids.entries()) {
      const { error } = await supabase.from("ticket_sections").update({ sort_order: index + 1 }).eq("id", rowId);
      if (error) return { error };
    }
    return { error: null };
  });
}
