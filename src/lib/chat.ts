// Regole della chat condivise da server e browser (dal Westeros: chat-ttl.ts).
// I messaggi restano visibili per ttl_minutes (Gestione → Chat), poi spariscono
// dalla chat; nel database restano tutti.

import type { ChatSettings, MessageKind } from "@/lib/types";

/** Valori predefiniti, se le impostazioni non si leggono */
export const DEFAULT_CHAT_SETTINGS: ChatSettings = { max_length: 1200, ttl_minutes: 60, idle_minutes: 120 };

/** Limiti consentiti nel pannello (uguali ai controlli del database) */
export const CHAT_LIMITS = {
  max_length: { min: 100, max: 4000 },
  ttl_minutes: { min: 10, max: 1440 },
  idle_minutes: { min: 15, max: 1440 },
} as const;

/** Quanti messaggi si caricano entrando o tornando sulla pagina */
export const HISTORY_SIZE = 100;

export function isFresh(createdAt: string, now: number, ttlMinutes: number) {
  return now - Date.parse(createdAt) < ttlMinutes * 60_000;
}

/** Da quando prendere i messaggi ancora visibili */
export function freshSince(now: number, ttlMinutes: number) {
  return new Date(now - ttlMinutes * 60_000).toISOString();
}

/** Minuti entro cui il proprio messaggio si può correggere (una volta) */
export const EDIT_WINDOW_MS = 5 * 60_000;

export const KIND_LABEL: Record<MessageKind, string> = {
  azione: "Azione",
  fuori_gioco: "Fuori gioco (OFF)",
  master: "Narrazione master",
  dado: "Dado",
  sistema: "Avviso",
  sussurro: "Sussurro",
};
