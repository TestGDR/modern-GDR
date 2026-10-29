"use server";

import { refresh } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { birthDateFor, parseSettings } from "@/lib/interlock";
import { createClient } from "@/lib/supabase/server";
import type { GameSetting } from "@/lib/types";

export type SaveResult = { ok: boolean; error?: string };

export type CreationPatch = {
  /** Passaggio raggiunto (si salva solo se più avanti di quello già raggiunto) */
  step?: number;
  profile?: {
    sex: "M" | "F" | "X" | null;
    age: number | null;
    birthDay: number | null;
    birthMonth: number | null;
    nationality: string;
  };
  attributes?: Record<string, number>;
  optionIds?: string[];
  skills?: Record<string, number>;
  background?: {
    studyTrackId: string | null;
    yearId: string | null;
    clubId: string | null;
    appearance: string;
    traits: string;
    bio: string;
  };
};

const idOrNull = (v: string | null) => (v && isUuid(v) ? v : null);
const text = (v: string, max: number) => (v.trim() ? v.trim().slice(0, max) : null);

/** Crea la bozza del personaggio (il nome è quello scelto in registrazione) */
export async function startCharacter(): Promise<SaveResult> {
  const { profile, character } = await requirePlayer();
  if (character) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.from("characters").insert({ name: profile.username });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Il tuo livello non permette di creare personaggi." };
    if (error.message.includes("massimo")) return { ok: false, error: "Hai raggiunto il numero massimo di personaggi." };
    return { ok: false, error: `Non è stato possibile creare il personaggio: ${error.message}` };
  }
  refresh();
  return { ok: true };
}

/** Salvataggio automatico di un passaggio della creazione */
export async function saveCreation(characterId: string, patch: CreationPatch): Promise<SaveResult> {
  const { character } = await requirePlayer();
  if (!character || character.id !== characterId) return { ok: false, error: "Scheda non trovata." };
  if (character.status !== "bozza" && character.status !== "rifiutata") {
    return { ok: false, error: "La scheda è già stata inviata." };
  }

  const supabase = await createClient();
  let warning: string | undefined;
  const fields: Record<string, string | number | null> = {};

  if (patch.step && patch.step > character.creation_step) fields.creation_step = Math.min(6, Math.max(1, patch.step));

  if (patch.profile) {
    const p = patch.profile;
    fields.sex = p.sex === "M" || p.sex === "F" || p.sex === "X" ? p.sex : null;
    fields.age = p.age && Number.isInteger(p.age) ? p.age : null;
    fields.nationality = text(p.nationality ?? "", 60);
    // L'anno di nascita si ricava dall'età e dall'anno di gioco
    const { data: rows } = await supabase.from("game_settings").select("*").overrideTypes<GameSetting[], { merge: false }>();
    const settings = parseSettings(rows ?? []);
    fields.birth_date =
      p.age && p.birthDay && p.birthMonth ? birthDateFor(p.age, p.birthDay, p.birthMonth, settings) : null;
    if (p.birthDay && p.birthMonth && !fields.birth_date) warning = "Questa data non esiste: controlla giorno e mese.";
  }

  if (patch.background) {
    const b = patch.background;
    fields.study_track_id = idOrNull(b.studyTrackId);
    fields.year_id = idOrNull(b.yearId);
    fields.club_id = idOrNull(b.clubId);
    fields.appearance = text(b.appearance, 3000);
    fields.traits = text(b.traits, 3000);
    fields.bio = text(b.bio, 5000);
  }

  if (Object.keys(fields).length > 0) {
    const { error } = await supabase.from("characters").update(fields).eq("id", characterId);
    if (error) return { ok: false, error: `Salvataggio non riuscito: ${error.message}` };
  }

  if (patch.attributes) {
    const rows = Object.entries(patch.attributes)
      .filter(([id, v]) => isUuid(id) && Number.isInteger(v) && v >= 1 && v <= 10)
      .map(([attribute_id, value]) => ({ character_id: characterId, attribute_id, value }));
    if (rows.length) {
      const { error } = await supabase.from("character_attributes").upsert(rows);
      if (error) return { ok: false, error: `Caratteristiche non salvate: ${error.message}` };
    }
  }

  if (patch.optionIds) {
    const ids = patch.optionIds.filter(isUuid);
    const del = supabase.from("character_options").delete().eq("character_id", characterId);
    const { error: delError } = ids.length ? await del.not("option_id", "in", `(${ids.join(",")})`) : await del;
    if (delError) return { ok: false, error: `Scelte non salvate: ${delError.message}` };
    if (ids.length) {
      const { error } = await supabase
        .from("character_options")
        .upsert(ids.map((option_id) => ({ character_id: characterId, option_id })), { ignoreDuplicates: true });
      if (error) return { ok: false, error: `Scelte non salvate: ${error.message}` };
    }
  }

  if (patch.skills) {
    const entries = Object.entries(patch.skills).filter(([id, l]) => isUuid(id) && Number.isInteger(l) && l >= 0 && l <= 10);
    const zero = entries.filter(([, l]) => l === 0).map(([id]) => id);
    const rows = entries.filter(([, l]) => l > 0).map(([skill_id, level]) => ({ character_id: characterId, skill_id, level }));
    if (zero.length) {
      const { error } = await supabase.from("character_skills").delete().eq("character_id", characterId).in("skill_id", zero);
      if (error) return { ok: false, error: `Abilità non salvate: ${error.message}` };
    }
    if (rows.length) {
      const { error } = await supabase.from("character_skills").upsert(rows);
      if (error) {
        if (error.message.includes("caratteristica collegata")) {
          return { ok: false, error: "Un'abilità non può superare la caratteristica collegata." };
        }
        return { ok: false, error: `Abilità non salvate: ${error.message}` };
      }
    }
  }

  return { ok: true, error: warning };
}

/** Invio per approvazione: il database ricontrolla tutto */
export async function submitCharacter(characterId: string): Promise<SaveResult> {
  await requirePlayer();
  if (!isUuid(characterId)) return { ok: false, error: "Scheda non trovata." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_character", { p_character: characterId });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Approvazione o rifiuto (solo chi ha il permesso: lo controlla il database) */
export async function reviewCharacter(characterId: string, approve: boolean, reason: string): Promise<SaveResult> {
  await requirePlayer();
  if (!isUuid(characterId)) return { ok: false, error: "Scheda non trovata." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_character", {
    p_character: characterId,
    p_approve: approve,
    p_reason: reason.trim() || null,
  });
  if (error) {
    // la scheda era già stata approvata o rifiutata (es. dal ticket): si ricarica lo stato vero
    if (error.message.includes("non è in attesa")) {
      refresh();
      return { ok: false, error: "Questa scheda è già stata approvata o rifiutata: la finestra si aggiorna con lo stato attuale." };
    }
    return { ok: false, error: error.message };
  }
  refresh();
  return { ok: true };
}
