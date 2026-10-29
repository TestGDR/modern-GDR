"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/actions/admin";
import { requirePlayer } from "@/lib/auth";
import { isValidFirstName, isValidName, NAME_MAX, NAME_MIN, normalizeName } from "@/lib/character-name";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Utility: prestavolti e banca. I controlli veri li fa il database.

type DbError = { message: string; code?: string } | null;

function result(error: DbError): ActionResult {
  if (!error) return { ok: true };
  if (error.code === "42501" || error.code === "P0001") return { ok: false, error: error.message };
  return { ok: false, error: "Operazione non riuscita. Riprova." };
}

const MAX_AMOUNT = 100_000_000;
const validAmount = (n: number) => Number.isInteger(n) && n !== 0 && Math.abs(n) <= MAX_AMOUNT;

/** Registra il prestavolto (il giocatore, una volta sola) o lo cambia/toglie (staff) */
export async function setFaceClaim(characterId: string, faceClaim: string): Promise<ActionResult> {
  if (!isUuid(characterId)) return { ok: false, error: "Personaggio non valido." };
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_face_claim", { p_character: characterId, p_face_claim: faceClaim.slice(0, 120) });
  if (!error) refresh();
  return result(error);
}

/** Cambio di nome e cognome: una volta sola (lo controlla rename_character nel database) */
export async function renameCharacter(first: string, last: string): Promise<ActionResult> {
  const f = normalizeName(first);
  const l = normalizeName(last);
  if (!f || !l) return { ok: false, error: "Scrivi sia il nome sia il cognome." };
  if (!isValidFirstName(f)) return { ok: false, error: "Il nome è una parola sola, da 2 a 20 lettere (per i nomi doppi usa il trattino, es. Maria-Luisa)." };
  if (!isValidName(`${f} ${l}`)) {
    return { ok: false, error: `Nome e cognome: da ${NAME_MIN} a ${NAME_MAX} caratteri in tutto, solo lettere, spazi, apostrofo, punto o trattino.` };
  }
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("rename_character", { p_first: f, p_last: l });
  if (!error) refresh();
  return result(error);
}

/** Registra il prestatalento (il giocatore, una volta sola) o lo cambia/toglie (staff) */
export async function setTalentClaim(characterId: string, talentClaim: string): Promise<ActionResult> {
  if (!isUuid(characterId)) return { ok: false, error: "Personaggio non valido." };
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_talent_claim", { p_character: characterId, p_talent_claim: talentClaim.slice(0, 120) });
  if (!error) refresh();
  return result(error);
}

/** Manda dollari al personaggio di un altro giocatore */
export async function bankTransfer(fromId: string, toId: string, amount: number, reason: string): Promise<ActionResult> {
  if (!isUuid(fromId) || !isUuid(toId)) return { ok: false, error: "Scegli a chi mandare i soldi." };
  if (!validAmount(amount) || amount < 0) return { ok: false, error: "Indica quanti dollari mandare." };
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("bank_transfer", { p_from: fromId, p_to: toId, p_amount: amount, p_reason: reason.slice(0, 200) });
  if (!error) refresh();
  return result(error);
}

/** Staff: dà (positivo) o toglie (negativo) dollari con un motivo */
export async function bankStaffAdjust(characterId: string, amount: number, reason: string): Promise<ActionResult> {
  if (!isUuid(characterId)) return { ok: false, error: "Personaggio non valido." };
  if (!validAmount(amount)) return { ok: false, error: "Indica quanti dollari dare o togliere." };
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("bank_staff_adjust", { p_character: characterId, p_amount: amount, p_reason: reason.slice(0, 200) });
  if (!error) refresh();
  return result(error);
}
