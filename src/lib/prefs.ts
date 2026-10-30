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
  text_scale: number;
  speech_color: string;
  action_color: string;
};

export const DEFAULT_PREFS: Prefs = {
  sounds_on: true,
  volume: 80,
  sound_on: "file-chat2",
  sound_off: "file-bip1",
  sound_chat: "file-chat1",
  chat_sound_on: true,
  text_scale: 100,
  speech_color: "#fde68a",
  action_color: "#e4dfdb",
};

export const TEXT_SCALES = [
  { value: 90, label: "Piccolo" },
  { value: 100, label: "Normale" },
  { value: 112, label: "Grande" },
  { value: 125, label: "Più grande" },
  { value: 140, label: "Molto grande" },
];

// le ultime lette o salvate nel database (per tornarci uscendo dall'anteprima)
let saved: Prefs | null = null;
const COLUMNS = "sounds_on, volume, sound_on, sound_off, sound_chat, chat_sound_on, text_scale, speech_color, action_color";

/** Applica le preferenze alla pagina: variabili CSS e suoni */
export function applyPrefs(p: Prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--text-scale", String(p.text_scale / 100));
  root.setProperty("--chat-speech", p.speech_color);
  root.setProperty("--chat-action", p.action_color);
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
