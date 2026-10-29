"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/actions/admin";
import { requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Scheda gestita dall'Amministratore: sblocca, resetta, modifica completa.
// Il database ricontrolla che sia davvero l'Amministratore.

type DbError = { message: string; code?: string } | null;

function result(error: DbError): ActionResult {
  if (!error) return { ok: true };
  if (error.code === "42501" || error.code === "P0001") return { ok: false, error: error.message };
  if (error.message.includes("caratteristica collegata")) return { ok: false, error: "Un'abilità non può superare la sua caratteristica." };
  if (error.message.includes("massimo assoluto")) return { ok: false, error: "Un'abilità supera il massimo consentito." };
  if (error.code === "23514") return { ok: false, error: "Un valore non è valido: controlla i campi." };
  return { ok: false, error: "Operazione non riuscita. Riprova." };
}

async function adminOnly() {
  const player = await requirePlayer();
  return player.level.is_admin;
}

export async function unlockCharacter(id: string): Promise<ActionResult> {
  if (!isUuid(id) || !(await adminOnly())) return { ok: false, error: "Solo l'Amministratore può sbloccare una scheda." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_unlock_character", { p_character: id });
  if (!error) refresh();
  return result(error);
}

export async function resetCharacter(id: string): Promise<ActionResult> {
  if (!isUuid(id) || !(await adminOnly())) return { ok: false, error: "Solo l'Amministratore può resettare una scheda." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reset_character", { p_character: id });
  if (!error) refresh();
  return result(error);
}

export type AdminSheetInput = {
  sex: "M" | "F" | "X" | null;
  age: number | null;
  birthDate: string | null;
  nationality: string;
  studyTrackId: string | null;
  yearId: string | null;
  clubId: string | null;
  occupation: string;
  districtId: string | null;
  quote: string;
  px: number;
  avatarUrl: string;
  coverUrl: string;
  texts: { bio: string; appearance: string; traits: string; known_facts: string; relationships: string; equipment: string };
  attributes: Record<string, number>;
  skills: Record<string, number>;
  optionIds: string[];
};

const LIMITS = { bio: 5000, appearance: 3000, traits: 3000, known_facts: 3000, relationships: 3000, equipment: 3000 } as const;
const txt = (v: string, max: number) => (v.trim() ? v.trim().slice(0, max) : null);
const idOrNull = (v: string | null) => (v && isUuid(v) ? v : null);

/** Modifica completa di una scheda (anche le parti che il giocatore non tocca) */
export async function adminSaveCharacter(id: string, input: AdminSheetInput): Promise<ActionResult> {
  if (!isUuid(id) || !(await adminOnly())) return { ok: false, error: "Solo l'Amministratore può modificare così una scheda." };
  if (input.age !== null && (!Number.isInteger(input.age) || input.age < 10 || input.age > 120)) return { ok: false, error: "L'età va da 10 a 120." };
  if (input.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) return { ok: false, error: "Data di nascita non valida." };
  if (!Number.isInteger(input.px) || input.px < 0 || input.px > 100000) return { ok: false, error: "I PX vanno da 0 a 100.000." };
  for (const url of [input.avatarUrl, input.coverUrl]) {
    if (url.trim() && !/^https:\/\/\S+$/.test(url.trim())) return { ok: false, error: "I link delle immagini devono iniziare con https://" };
  }
  const row: Record<string, string | number | null> = {
    sex: input.sex === "M" || input.sex === "F" || input.sex === "X" ? input.sex : null,
    age: input.age,
    birth_date: input.birthDate || null,
    nationality: txt(input.nationality, 60),
    study_track_id: idOrNull(input.studyTrackId),
    year_id: idOrNull(input.yearId),
    club_id: idOrNull(input.clubId),
    occupation: txt(input.occupation, 60),
    district_id: idOrNull(input.districtId),
    quote: txt(input.quote, 140),
    px: input.px,
    avatar_url: txt(input.avatarUrl, 500),
    cover_url: txt(input.coverUrl, 500),
  };
  for (const [key, max] of Object.entries(LIMITS)) row[key] = txt(input.texts[key as keyof typeof LIMITS], max);

  const supabase = await createClient();
  const { data, error } = await supabase.from("characters").update(row).eq("id", id).select("id");
  if (error) return result(error);
  if (!data?.length) return { ok: false, error: "Non hai il permesso di modificare questa scheda." };

  const clean = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).filter(([k, v]) => isUuid(k) && Number.isInteger(v) && v >= 0 && v <= 10));
  const { error: buildError } = await supabase.rpc("admin_set_build", {
    p_character: id,
    p_attributes: clean(input.attributes),
    p_skills: clean(input.skills),
    p_options: input.optionIds.filter(isUuid),
  });
  if (buildError) return result(buildError);
  refresh();
  return { ok: true };
}
