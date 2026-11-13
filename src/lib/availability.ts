import type { SupabaseClient } from "@supabase/supabase-js";
import { forgetPrefsRow, readPrefsRow } from "@/lib/prefs";

// Disponibilità scelta dal giocatore (dal Westeros: availability.ts).
// Disponibilità e messaggio OFF personale sono dell'account: stanno nel database
// (user_prefs), uguali su ogni PC e browser.
export type Availability = "disponibile" | "cerca" | "occupato";

export const AVAILABILITY: Record<Availability, { label: string; dot: string }> = {
  disponibile: { label: "Disponibile", dot: "bg-mint shadow-[0_0_6px_var(--mint)]" },
  cerca: { label: "In cerca di gioco", dot: "bg-peach shadow-[0_0_6px_var(--peach)]" },
  occupato: { label: "Occupato", dot: "bg-flamingo shadow-[0_0_6px_var(--flamingo)]" },
};

export function isAvailability(value: unknown): value is Availability {
  return value === "disponibile" || value === "cerca" || value === "occupato";
}

/** Disponibilità e messaggio OFF dell'account collegato (la RLS dà solo la propria riga) */
export async function loadPresenceState(supabase: SupabaseClient): Promise<{ availability: Availability; note: string }> {
  const data = await readPrefsRow(supabase);
  const availability = data?.availability;
  return {
    availability: isAvailability(availability) ? availability : "disponibile",
    note: String(data?.presence_note ?? "").slice(0, 80),
  };
}

/** Salva nel database solo i campi passati */
export async function savePresenceState(supabase: SupabaseClient, userId: string, value: { availability?: Availability; note?: string }) {
  const row: Record<string, string> = { user_id: userId };
  if (value.availability) row.availability = value.availability;
  if (value.note !== undefined) row.presence_note = value.note.slice(0, 80);
  const { error } = await supabase.from("user_prefs").upsert(row);
  forgetPrefsRow();
  return !error;
}
