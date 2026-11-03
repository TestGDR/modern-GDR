"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { setSoundPrefs, soundOr } from "@/lib/notify-sound";

// Preferenze dell'account (dal Westeros: prefs.ts): suoni, volume, grandezza
// del testo, colori del parlato e delle azioni in chat. Solo nel database
// (user_prefs): sono dell'account, uguali su ogni PC e browser.

export type Prefs = {
  sounds_on: boolean;
  volume: number;
  sound_on: string;
  sound_off: string;
  sound_chat: string;
  chat_sound_on: boolean;
  /** grandezza del testo della chat, in punti */
  chat_font_pt: number;
  speech_color: string;
  action_color: string;
  /** grandezza degli altri messaggi della chat (dadi, sussurri, OFF…), in punti */
  chat_other_pt: number;
  chat_font_family: ChatFontFamily;
  chat_line: ChatLine;
  /** colore dei nomi degli altri personaggi in chat */
  name_color: string;
  chat_avatars: ChatAvatars;
};

export type ChatFontFamily = "normale" | "libro" | "macchina" | "elegante";
export type ChatLine = "compatta" | "normale" | "ampia";
export type ChatAvatars = "grandi" | "piccoli" | "nascosti";

/** Caratteri delle azioni (solo caratteri già nel sistema o nel sito, niente download) */
export const CHAT_FONT_FAMILIES: { id: ChatFontFamily; label: string; css: string }[] = [
  { id: "normale", label: "Normale", css: "inherit" },
  { id: "libro", label: "Libro", css: "Georgia, 'Times New Roman', serif" },
  { id: "macchina", label: "Macchina da scrivere", css: "'Courier New', Courier, monospace" },
  { id: "elegante", label: "Elegante", css: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" },
];
export const CHAT_LINES: { id: ChatLine; label: string; css: string }[] = [
  { id: "compatta", label: "Compatta", css: "1.4" },
  { id: "normale", label: "Normale", css: "1.625" },
  { id: "ampia", label: "Ampia", css: "1.9" },
];
export const CHAT_AVATARS: { id: ChatAvatars; label: string }[] = [
  { id: "grandi", label: "Grandi" },
  { id: "piccoli", label: "Piccoli" },
  { id: "nascosti", label: "Nascosti" },
];

export const DEFAULT_PREFS: Prefs = {
  sounds_on: true,
  volume: 80,
  sound_on: "file-chat2",
  sound_off: "file-bip1",
  sound_chat: "file-chat1",
  chat_sound_on: true,
  chat_font_pt: 11,
  speech_color: "#fde68a",
  action_color: "#e4dfdb",
  chat_other_pt: 10,
  chat_font_family: "normale",
  chat_line: "normale",
  name_color: "#f2b39c",
  chat_avatars: "grandi",
};

/** Grandezze del testo della chat, in pt */
export const CHAT_FONT_SIZES = [9, 10, 11, 12, 13, 14, 15, 16, 18];

// le ultime lette o salvate nel database (per tornarci uscendo dall'anteprima)
let saved: Prefs | null = null;
const COLUMNS =
  "sounds_on, volume, sound_on, sound_off, sound_chat, chat_sound_on, chat_font_pt, speech_color, action_color, chat_other_pt, chat_font_family, chat_line, name_color, chat_avatars";

/** Applica le preferenze alla pagina: variabili CSS e suoni */
export function applyPrefs(p: Prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--chat-font", `${p.chat_font_pt}pt`);
  root.setProperty("--chat-speech", p.speech_color);
  root.setProperty("--chat-action", p.action_color);
  root.setProperty("--chat-other", `${p.chat_other_pt}pt`);
  root.setProperty("--chat-family", CHAT_FONT_FAMILIES.find((f) => f.id === p.chat_font_family)?.css ?? "inherit");
  root.setProperty("--chat-line", CHAT_LINES.find((l) => l.id === p.chat_line)?.css ?? "1.625");
  root.setProperty("--chat-name", p.name_color);
  document.documentElement.dataset.chatAvatars = p.chat_avatars;
  setSoundPrefs({
    on: p.sounds_on,
    volume: p.volume,
    soundOn: p.sound_on,
    soundOff: p.sound_off,
    soundChat: p.sound_chat,
    chatOn: p.chat_sound_on,
  });
}

/** Le preferenze salvate dell'account (null finché non arrivano dal database) */
export function savedPrefs(): Prefs | null {
  return saved;
}

/** Le proprie preferenze (la RLS restituisce solo la propria riga) */
export async function loadPrefs(supabase: SupabaseClient): Promise<Prefs> {
  const { data } = await supabase.from("user_prefs").select(COLUMNS).maybeSingle();
  const p = { ...DEFAULT_PREFS, ...((data as Partial<Prefs> | null) ?? {}) };
  saved = {
    ...p,
    sound_on: soundOr(p.sound_on, "on"),
    sound_off: soundOr(p.sound_off, "off"),
    sound_chat: soundOr(p.sound_chat, "chat"),
  };
  return saved;
}

export async function savePrefs(supabase: SupabaseClient, p: Prefs) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await supabase.from("user_prefs").upsert({ user_id: data.user.id, ...p, updated_at: new Date().toISOString() });
  if (!error) saved = p;
  return !error;
}
