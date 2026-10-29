"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPlayer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

/** "Scrivi come": personaggio (On Game) oppure utente (Off Game) */
function asCharacter(formData: FormData, characterId: string | undefined) {
  return formData.get("as_character") === "on" && characterId ? characterId : null;
}

export async function createThread(_prev: FormState, formData: FormData): Promise<FormState> {
  const player = await getPlayer();
  if (!player) redirect("/login");

  const boardId = text(formData, "board_id");
  const boardSlug = text(formData, "board_slug");
  const title = text(formData, "title");
  const body = text(formData, "body");
  if (title.length < 3) return { error: "Il titolo deve avere almeno 3 caratteri." };
  if (!body) return { error: "Scrivi il primo messaggio della discussione." };

  const supabase = await createClient();
  const characterId = asCharacter(formData, player.character?.id);
  const { data: thread, error } = await supabase
    .from("forum_threads")
    .insert({ board_id: boardId, title: title.slice(0, 120), character_id: characterId })
    .select("id")
    .single<{ id: string }>();

  if (error || !thread) {
    if (error?.code === "42501") return { error: "Non puoi aprire discussioni in questa bacheca." };
    return { error: `Non è stato possibile aprire la discussione: ${error?.message}` };
  }

  const { error: postError } = await supabase
    .from("forum_posts")
    .insert({ thread_id: thread.id, body: body.slice(0, 20000), character_id: characterId });
  if (postError) return { error: `Discussione creata, ma il messaggio non è stato salvato: ${postError.message}` };

  redirect(`/forum/${boardSlug}/${thread.id}`);
}

export async function replyToThread(_prev: FormState, formData: FormData): Promise<FormState> {
  const player = await getPlayer();
  if (!player) redirect("/login");

  const threadId = text(formData, "thread_id");
  const body = text(formData, "body");
  if (!body) return { error: "Il messaggio è vuoto." };

  const supabase = await createClient();
  const { error } = await supabase.from("forum_posts").insert({
    thread_id: threadId,
    body: body.slice(0, 20000),
    character_id: asCharacter(formData, player.character?.id),
  });

  if (error) {
    if (error.code === "42501") return { error: "La discussione è chiusa: non si può più rispondere." };
    return { error: `Risposta non inviata: ${error.message}` };
  }
  refresh();
  return { success: "Risposta pubblicata." };
}

/** Segna tutto il forum come letto */
export async function markForumRead() {
  const player = await getPlayer();
  if (!player) redirect("/login");
  const supabase = await createClient();
  await supabase.rpc("forum_mark_read", { p_thread: null });
  refresh();
}

/* ------------------------------ Moderazione (forum.moderare) ------------------------------ */
// I controlli veri li fanno policy e trigger del database.

type ModResult = { ok: true; slug?: string } | { ok: false; error: string };

function modError(error: { message: string; code?: string } | null, fallback: string): ModResult {
  if (!error) return { ok: true };
  if (error.code === "42501" || error.code === "P0001" || error.message.includes("Solo chi modera")) return { ok: false, error: "Non hai il permesso di farlo." };
  return { ok: false, error: fallback };
}

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Fissa, rende importante o chiude (e il contrario) */
export async function setThreadFlag(threadId: string, flag: "is_pinned" | "is_locked" | "is_important", value: boolean): Promise<ModResult> {
  if (!isId(threadId) || !["is_pinned", "is_locked", "is_important"].includes(flag)) return { ok: false, error: "Richiesta non valida." };
  await requirePlayerOrLogin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("forum_threads").update({ [flag]: value }).eq("id", threadId).select("id");
  if (!error && !data?.length) return { ok: false, error: "Non hai il permesso di farlo." };
  if (!error) refresh();
  return modError(error, "Operazione non riuscita.");
}

export async function renameThread(threadId: string, title: string): Promise<ModResult> {
  const clean = title.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!isId(threadId)) return { ok: false, error: "Discussione non valida." };
  if (clean.length < 3) return { ok: false, error: "Il titolo deve avere almeno 3 caratteri." };
  await requirePlayerOrLogin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("forum_threads").update({ title: clean }).eq("id", threadId).select("id");
  if (!error && !data?.length) return { ok: false, error: "Non hai il permesso di farlo." };
  if (!error) refresh();
  return modError(error, "Titolo non salvato.");
}

/** Sposta in un'altra sezione: restituisce l'indirizzo della nuova sezione */
export async function moveThread(threadId: string, boardId: string): Promise<ModResult> {
  if (!isId(threadId) || !isId(boardId)) return { ok: false, error: "Scegli la sezione." };
  await requirePlayerOrLogin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forum_threads")
    .update({ board_id: boardId })
    .eq("id", threadId)
    .select("board:forum_boards(slug)")
    .overrideTypes<{ board: { slug: string } | null }[], { merge: false }>();
  if (error) return modError(error, "Discussione non spostata.");
  const slug = data?.[0]?.board?.slug;
  if (!slug) return { ok: false, error: "Non hai il permesso di farlo." };
  return { ok: true, slug };
}

export async function deleteThread(threadId: string): Promise<ModResult> {
  if (!isId(threadId)) return { ok: false, error: "Discussione non valida." };
  await requirePlayerOrLogin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("forum_threads").delete().eq("id", threadId).select("id");
  if (!error && !data?.length) return { ok: false, error: "Non hai il permesso di farlo." };
  return modError(error, "Discussione non eliminata.");
}

/** Segnala (o toglie la segnalazione) dell'intera discussione: si segnala il primo messaggio */
export async function highlightThread(firstPostId: number, on: boolean): Promise<ModResult> {
  if (!Number.isInteger(firstPostId)) return { ok: false, error: "Discussione non valida." };
  await requirePlayerOrLogin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("forum_highlight_post", { p_post: firstPostId, p_on: on });
  if (!error) refresh();
  return modError(error, "Segnalazione non riuscita.");
}

/** Modifica un messaggio: l'autore il proprio, chi modera tutti */
export async function editPost(postId: number, body: string): Promise<ModResult> {
  const clean = body.trim().slice(0, 20000);
  if (!Number.isInteger(postId)) return { ok: false, error: "Messaggio non valido." };
  if (!clean) return { ok: false, error: "Il messaggio è vuoto." };
  await requirePlayerOrLogin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("forum_posts").update({ body: clean }).eq("id", postId).select("id");
  if (!error && !data?.length) return { ok: false, error: "Non puoi modificare questo messaggio." };
  if (!error) refresh();
  return modError(error, "Messaggio non salvato.");
}

export async function deletePost(postId: number): Promise<ModResult> {
  if (!Number.isInteger(postId)) return { ok: false, error: "Messaggio non valido." };
  await requirePlayerOrLogin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("forum_posts").delete().eq("id", postId).select("id");
  if (!error && !data?.length) return { ok: false, error: "Non puoi eliminare questo messaggio." };
  if (!error) refresh();
  return modError(error, "Messaggio non eliminato.");
}

async function requirePlayerOrLogin() {
  const player = await getPlayer();
  if (!player) redirect("/login");
  return player;
}
