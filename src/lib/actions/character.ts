"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPlayer } from "@/lib/auth";
import { STAT_KEYS, STAT_MAX, STAT_MIN, STATS_BUDGET } from "@/lib/character-stats";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

function text(formData: FormData, key: string, max: number) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value.slice(0, max) : null;
}

function readDetails(formData: FormData) {
  const ageRaw = Number(formData.get("age"));
  const district = text(formData, "district_id", 64);
  return {
    age: Number.isInteger(ageRaw) && ageRaw >= 16 && ageRaw <= 99 ? ageRaw : null,
    occupation: text(formData, "occupation", 60),
    district_id: district,
    quote: text(formData, "quote", 140),
    bio: text(formData, "bio", 5000),
  };
}

export async function createCharacter(_prev: FormState, formData: FormData): Promise<FormState> {
  const player = await getPlayer();
  if (!player) redirect("/login");
  if (player.character) redirect("/bacheca");

  const name = text(formData, "name", 40);
  if (!name || name.length < 3) return { error: "Il nome del personaggio deve avere almeno 3 caratteri." };

  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, Number(formData.get(k))]));
  const valid = STAT_KEYS.every((k) => Number.isInteger(stats[k]) && stats[k] >= STAT_MIN && stats[k] <= STAT_MAX);
  const total = STAT_KEYS.reduce((sum, k) => sum + stats[k], 0);
  if (!valid || total > STATS_BUDGET) {
    return { error: `Caratteristiche non valide: ognuna da 1 a 10, massimo ${STATS_BUDGET} punti in totale.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("characters").insert({ name, ...readDetails(formData), ...stats });

  if (error) {
    if (error.code === "23505") return { error: "Esiste già un personaggio con questo nome." };
    return { error: `Non è stato possibile creare il personaggio: ${error.message}` };
  }
  redirect("/bacheca");
}

export async function updateCharacter(_prev: FormState, formData: FormData): Promise<FormState> {
  const player = await getPlayer();
  if (!player?.character) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("characters")
    .update(readDetails(formData))
    .eq("id", player.character.id);

  if (error) return { error: `Salvataggio non riuscito: ${error.message}` };
  refresh();
  return { success: "Scheda aggiornata." };
}
