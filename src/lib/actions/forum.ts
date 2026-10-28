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

/** Solo staff: fissa/sblocca e chiude/riapre (lo controlla anche il database) */
export async function toggleThreadFlag(formData: FormData) {
  const player = await getPlayer();
  if (!player) redirect("/login");
  const threadId = text(formData, "thread_id");
  const flag = text(formData, "flag");
  const value = text(formData, "value") === "true";
  if (flag !== "is_pinned" && flag !== "is_locked") return;

  const supabase = await createClient();
  await supabase.from("forum_threads").update({ [flag]: value }).eq("id", threadId);
  refresh();
}
