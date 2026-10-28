"use server";

import { refresh } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createPost(_prev: FormState, formData: FormData): Promise<FormState> {
  const { character } = await requirePlayer();
  const body = text(formData, "body");
  const location = text(formData, "location");
  if (!body) return { error: "Scrivi qualcosa prima di pubblicare." };

  const supabase = await createClient();
  const { error } = await supabase.from("social_posts").insert({
    character_id: character.id,
    body: body.slice(0, 2000),
    location: location ? location.slice(0, 60) : null,
  });
  if (error) return { error: `Post non pubblicato: ${error.message}` };

  refresh();
  return { success: "Pubblicato!" };
}

export async function toggleLike(formData: FormData) {
  const { character } = await requirePlayer();
  const postId = text(formData, "post_id");
  const liked = text(formData, "liked") === "true";

  const supabase = await createClient();
  if (liked) {
    await supabase.from("social_likes").delete().eq("post_id", postId).eq("character_id", character.id);
  } else {
    await supabase.from("social_likes").insert({ post_id: postId, character_id: character.id });
  }
  refresh();
}

export async function addComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { character } = await requirePlayer();
  const postId = text(formData, "post_id");
  const body = text(formData, "body");
  if (!body) return { error: "Il commento è vuoto." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("social_comments")
    .insert({ post_id: postId, character_id: character.id, body: body.slice(0, 1000) });
  if (error) return { error: `Commento non inviato: ${error.message}` };

  refresh();
  return { success: "ok" };
}

export async function deletePost(formData: FormData) {
  await requirePlayer();
  const supabase = await createClient();
  await supabase.from("social_posts").delete().eq("id", text(formData, "post_id"));
  refresh();
}
