"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPlayer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

// Campi di testo della scheda modificabili dal giocatore, con la lunghezza massima
const TEXT_FIELDS = {
  occupation: 60,
  quote: 140,
  bio: 5000,
  appearance: 3000,
  traits: 3000,
  known_facts: 3000,
  relationships: 3000,
  equipment: 3000,
  height: 20,
  weight: 20,
  eye_color: 30,
  hair_color: 30,
} as const;
const URL_FIELDS = ["avatar_url", "cover_url", "cover_mobile_url"] as const;

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
  if (formData.has("district_id")) details.district_id = clean(formData.get("district_id"), 64);
  if (formData.has("minor_id")) details.minor_id = clean(formData.get("minor_id"), 64);

  return { details };
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
