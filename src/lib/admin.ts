import "server-only";
import { notFound } from "next/navigation";
import { ADMIN_SECTIONS } from "@/config/admin";
import { can, requirePlayer, type Player } from "@/lib/auth";

/**
 * Per le pagine del pannello: senza permesso la pagina risponde "non trovata".
 * Basta uno dei permessi indicati. La sicurezza vera resta nelle policy del database.
 */
export async function requirePermission(...permissions: string[]) {
  const player = await requirePlayer();
  if (!can(player, "admin.accedere") || !permissions.some((p) => can(player, p))) notFound();
  return player;
}

/** Sezioni del pannello che questo giocatore può vedere */
export function visibleSections(player: Player) {
  return ADMIN_SECTIONS.filter((s) => s.permissions.some((p) => can(player, p)));
}
