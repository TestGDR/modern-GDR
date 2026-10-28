import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Character, Profile } from "@/lib/types";

export type Player = {
  userId: string;
  profile: Profile;
  character: Character | null;
};

/**
 * Utente collegato, con profilo e personaggio (o null se non collegato).
 * `cache` evita di ripetere le query nella stessa richiesta.
 */
export const getPlayer = cache(async (): Promise<Player | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const [{ data: profile }, { data: character }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single<Profile>(),
    supabase.from("characters").select("*").eq("owner_id", userId).maybeSingle<Character>(),
  ]);
  if (!profile) return null;

  return { userId, profile, character };
});

/** Per le pagine di gioco: serve essere collegati e avere un personaggio. */
export async function requirePlayer() {
  const player = await getPlayer();
  if (!player) redirect("/login");
  if (!player.character) redirect("/crea-personaggio");
  return { ...player, character: player.character };
}

export function isStaff(profile: Profile) {
  return profile.role === "master" || profile.role === "admin";
}
