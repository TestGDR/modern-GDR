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

  const [{ data: profile }, { data: characters }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, level:user_levels(*)")
      .eq("id", userId)
      .single<Profile & { level: UserLevel }>(),
    // Un account può avere più schede (es. una rifiutata e una nuova): si prendono tutte
    supabase.from("characters").select("*").eq("owner_id", userId).order("created_at", { ascending: false }).limit(20).overrideTypes<Character[], { merge: false }>(),
  ]);
  if (!profile) return null;

  const { level, ...rest } = profile;
  return { userId, profile: rest, level, character: pickCharacter(characters ?? []) };
});

/**
 * Il personaggio dell'account: prima quello approvato, poi quello in attesa,
 * poi la bozza o il rifiutato più recente (le schede arrivano dalla più nuova).
 */
function pickCharacter(list: Character[]) {
  return (
    list.find((c) => c.status === "approvata") ??
    list.find((c) => c.status === "in_attesa") ??
    list.find((c) => c.status === "bozza") ??
    list[0] ??
    null
  );
}

/** Per le pagine di gioco: serve aver fatto l'accesso (il personaggio è facoltativo). */
export async function requirePlayer() {
  const player = await getPlayer();
  if (!player) redirect("/login");
  return player;
}

/** Il personaggio che può giocare: solo se la scheda è approvata */
export function activeCharacter(player: Pick<Player, "character">) {
  return player.character?.status === "approvata" ? player.character : null;
}

/** Per le azioni che richiedono un personaggio attivo (scrivere in chat, sul social…). */
export async function requireCharacter() {
  const player = await requirePlayer();
  const character = activeCharacter(player);
  if (!character) redirect("/scheda");
  return { ...player, character };
}

/**
 * Il giocatore ha questo permesso? (chiavi in src/lib/permissions.ts)
 * Serve a mostrare o nascondere i pulsanti: la verifica vera la fa il database.
 */
export function can(player: Pick<Player, "level">, permission: string) {
  return player.level.is_admin || player.level.permissions.includes(permission);
}
