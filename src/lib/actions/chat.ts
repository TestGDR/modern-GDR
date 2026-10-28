"use server";

import { requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Azioni della chat (dal Westeros: presence-actions.ts). Ogni controllo vero
// lo fa il database nelle funzioni chiamate qui.

export type ChatResult = { error?: string };

type RpcError = { message: string; code?: string } | null;

function result(error: RpcError): ChatResult {
  if (!error) return {};
  // P0001 e 42501 arrivano dalle funzioni con un messaggio già in italiano
  if (error.code === "P0001" || error.code === "42501") return { error: error.message };
  return { error: "Operazione non riuscita. Riprova." };
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<ChatResult> {
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  return result(error);
}

const bad = { error: "Dati non validi." };

/** Entra in giocata: da qui si leggono e si scrivono i messaggi */
export async function joinChat(roomId: string, characterId: string) {
  if (!isUuid(roomId) || !isUuid(characterId)) return bad;
  return rpc("join_chat", { p_room: roomId, p_character: characterId });
}

/** Esce dalla chat: quando esce l'ultimo la chat si svuota */
export async function leaveChat(roomId: string, characterId: string) {
  if (!isUuid(roomId) || !isUuid(characterId)) return bad;
  return rpc("leave_chat", { p_room: roomId, p_character: characterId });
}

/** Modalità master (max null = la spegne) */
export async function setMasterMode(roomId: string, characterId: string, min: number, max: number | null) {
  if (!isUuid(roomId) || !isUuid(characterId)) return bad;
  if (!Number.isInteger(min) || (max !== null && !Number.isInteger(max))) return bad;
  return rpc("set_master_mode", { p_room: roomId, p_character: characterId, p_min: min, p_max: max });
}

/** Correzione del proprio messaggio: una volta sola, entro 5 minuti */
export async function editMessage(id: number, content: string) {
  if (!Number.isInteger(id)) return bad;
  return rpc("edit_chat_message", { p_id: id, p_content: content.slice(0, 4000) });
}

/** Elimina il proprio messaggio (chi modera può eliminare tutti) */
export async function deleteMessage(id: number) {
  if (!Number.isInteger(id)) return bad;
  return rpc("delete_chat_message", { p_id: id });
}

/** Staff: accende o spegne l'invisibilità */
export async function setInvisible(on: boolean) {
  return rpc("set_invisible", { p_on: on });
}

/** Tiro Interlock: lo calcola il database */
export async function rollDice(roomId: string, characterId: string, attributeId: string, skillId: string | null) {
  if (!isUuid(roomId) || !isUuid(characterId) || !isUuid(attributeId) || (skillId !== null && !isUuid(skillId))) return bad;
  return rpc("roll_dice", { p_room: roomId, p_character: characterId, p_attribute: attributeId, p_skill: skillId });
}

/** Chat su invito: invita un personaggio per nome */
export async function inviteToRoom(roomId: string, name: string) {
  if (!isUuid(roomId) || name.trim().length < 2) return { error: "Scrivi il nome del personaggio." };
  return rpc("invite_to_room", { p_room: roomId, p_name: name.trim().slice(0, 60) });
}

/** Chat su invito: allontana un invitato */
export async function expelFromRoom(roomId: string, characterId: string) {
  if (!isUuid(roomId) || !isUuid(characterId)) return bad;
  return rpc("expel_from_room", { p_room: roomId, p_character: characterId });
}
