"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPlayer } from "@/lib/auth";
import { STAT_KEYS, STAT_MAX, STAT_MIN, STATS_BUDGET } from "@/lib/character-stats";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

// Campi di testo della scheda modificabili dal giocatore, con la lunghezza massima
const TEXT_FIELDS = {
  occupation: 60,
  quote: 140,
  bio: 5000,
  appearance: 3000,
  traits: 3000,
  skills: 3000,
  known_facts: 3000,
  relationships: 3000,
  equipment: 3000,
} as const;
const URL_FIELDS = ["avatar_url", "cover_url"] as const;

type Details = Record<string, string | number | null>;

function clean(value: FormDataEntryValue | null, max: number) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

/**
 * Legge solo i campi presenti nel modulo: così una sezione salvata
 * da sola non cancella le altre. Restituisce un errore se un link non va bene.
 */
function readDetails(formData: FormData): { details: Details; error?: string } {
  const details: Details = {};

  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (formData.has(key)) details[key] = clean(formData.get(key), max);
  }
  for (const key of URL_FIELDS) {
    if (!formData.has(key)) continue;
    const url = clean(formData.get(key), 500);
    if (url && !/^https:\/\/\S+$/.test(url)) {
      return { details, error: "I link delle immagini devono iniziare con https://" };
    }
    details[key] = url;
  }
  if (formData.has("age")) {
    const age = Number(formData.get("age"));
    details.age = Number.isInteger(age) && age >= 16 && age <= 99 ? age : null;
  }
  if (formData.has("district_id")) details.district_id = clean(formData.get("district_id"), 64);

  return { details };
}

export async function createCharacter(_prev: FormState, formData: FormData): Promise<FormState> {
  const player = await getPlayer();
  if (!player) redirect("/login");
  if (player.character) {
    refresh();
    return { success: "Il personaggio esiste già." };
  }

  // Il nome del personaggio è quello scelto in registrazione (profiles.username)
  const name = player.profile.username;

  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, Number(formData.get(k))]));
  const valid = STAT_KEYS.every((k) => Number.isInteger(stats[k]) && stats[k] >= STAT_MIN && stats[k] <= STAT_MAX);
  const total = STAT_KEYS.reduce((sum, k) => sum + stats[k], 0);
  if (!valid || total > STATS_BUDGET) {
    return { error: `Caratteristiche non valide: ognuna da 1 a 10, massimo ${STATS_BUDGET} punti in totale.` };
  }

  const { details, error: detailsError } = readDetails(formData);
  if (detailsError) return { error: detailsError };

  const supabase = await createClient();
  const { error } = await supabase.from("characters").insert({ name, ...details, ...stats });

  if (error) {
    if (error.code === "23505") return { error: "Esiste già un personaggio con questo nome." };
    return { error: `Non è stato possibile creare il personaggio: ${error.message}` };
  }
  // Nessun cambio di pagina: si ricaricano i dati e la scheda (pagina o finestra) mostra il personaggio
  refresh();
  return { success: "Personaggio creato!" };
}

export async function updateCharacter(_prev: FormState, formData: FormData): Promise<FormState> {
  const player = await getPlayer();
  if (!player?.character) redirect("/login");

  const { details, error: detailsError } = readDetails(formData);
  if (detailsError) return { error: detailsError };
  if (Object.keys(details).length === 0) return { success: "Niente da salvare." };

  const supabase = await createClient();
  const { error } = await supabase.from("characters").update(details).eq("id", player.character.id);

  if (error) return { error: `Salvataggio non riuscito: ${error.message}` };
  refresh();
  return { success: "Scheda aggiornata." };
}
