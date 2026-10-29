"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/actions/admin";
import { requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Gestione del sito (fase 7): iscrizioni, sospensioni, manutenzione.
// I permessi li controlla il database.

type DbError = { message: string; code?: string } | null;

function result(error: DbError): ActionResult {
  if (!error) return { ok: true };
  if (error.code === "42501" || error.code === "P0001") return { ok: false, error: error.message };
  return { ok: false, error: "Operazione non riuscita. Riprova." };
}

/** Apre o chiude le iscrizioni, con un messaggio facoltativo */
export async function saveSignups(open: boolean, message: string): Promise<ActionResult> {
  await requirePlayer();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("signup_settings")
    .update({ open, message: message.trim().slice(0, 200), updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id");
  if (error) return result(error);
  if (!data?.length) return { ok: false, error: "Non hai il permesso di gestire le iscrizioni." };
  refresh();
  return { ok: true };
}

/** Sospende un utente fino a una data ("infinity" per sempre); null toglie la sospensione */
export async function banUser(userId: string, until: string | null, reason: string): Promise<ActionResult> {
  if (!isUuid(userId)) return { ok: false, error: "Utente non valido." };
  if (until !== null && until !== "infinity" && Number.isNaN(Date.parse(until))) return { ok: false, error: "Data non valida." };
  await requirePlayer();
  const supabase = await createClient();
  const { error } = await supabase.rpc("ban_user", { p_user: userId, p_until: until, p_reason: reason.slice(0, 300) });
  if (!error) refresh();
  return result(error);
}

export type MaintenanceKind = "chat" | "messaggi" | "account";
const DAYS = [7, 30, 90, 180, 365];

/** Quanti elementi verrebbero eliminati */
export async function previewMaintenance(kind: MaintenanceKind, days: number): Promise<ActionResult & { count?: number }> {
  if (!["chat", "messaggi", "account"].includes(kind) || !DAYS.includes(days)) return { ok: false, error: "Scelta non valida." };
  await requirePlayer();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("maintenance_preview", { p_kind: kind, p_days: days });
  if (error) return result(error);
  return { ok: true, count: (data as number | null) ?? 0 };
}

/** Elimina davvero (dopo l'anteprima e la conferma) */
export async function runMaintenance(kind: MaintenanceKind, days: number): Promise<ActionResult & { count?: number }> {
  if (!["chat", "messaggi", "account"].includes(kind) || !DAYS.includes(days)) return { ok: false, error: "Scelta non valida." };
  await requirePlayer();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("maintenance_run", { p_kind: kind, p_days: days });
  if (error) return result(error);
  refresh();
  return { ok: true, count: (data as number | null) ?? 0 };
}
