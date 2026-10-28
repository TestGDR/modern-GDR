import "server-only";
import { cache } from "react";
import { io } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Character, Profile, UserLevel } from "@/lib/types";

export type Player = {
  userId: string;
  profile: Profile;
  /** Livello utente con i suoi permessi */
  level: UserLevel;
  /** null finché l'utente non crea il personaggio (dalla Scheda personaggio) */
  character: Character | null;
};

/**
 * Utente collegato, con profilo, livello e personaggio (o null se non collegato).
 * `cache` evita di ripetere le query nella stessa richiesta.
 */
export const getPlayer = cache(async (): Promise<Player | null> => {
  // Supabase controlla la scadenza della sessione con Date.now():
  // con Cache Components va fatto solo al momento della visita.
  await io();
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const [{ data: profile }, { data: character }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, level:user_levels(*)")
      .eq("id", userId)
      .single<Profile & { level: UserLevel }>(),
    supabase.from("characters").select("*").eq("owner_id", userId).maybeSingle<Character>(),
  ]);
  if (!profile) return null;

  const { level, ...rest } = profile;
  return { userId, profile: rest, level, character };
});

/** Per le pagine di gioco: serve aver fatto l'accesso (il personaggio è facoltativo). */
export async function requirePlayer() {
  const player = await getPlayer();
  if (!player) redirect("/login");
  return player;
}

/** Per le azioni che richiedono un personaggio (scrivere in chat, sul social…). */
export async function requireCharacter() {
  const player = await requirePlayer();
  if (!player.character) redirect("/scheda");
  return { ...player, character: player.character };
}

/**
 * Il giocatore ha questo permesso? (chiavi in src/lib/permissions.ts)
 * Serve a mostrare o nascondere i pulsanti: la verifica vera la fa il database.
 */
export function can(player: Pick<Player, "level">, permission: string) {
  return player.level.is_admin || player.level.permissions.includes(permission);
}
