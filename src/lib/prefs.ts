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
  /** grafica del sito: tramonto (giorno) o notte */
  theme: Theme;
};

export type Theme = "giorno" | "notte";

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
  theme: "giorno",
};

/** Grandezze del testo della chat, in pt */
export const CHAT_FONT_SIZES = [9, 10, 11, 12, 13, 14, 15, 16, 18];

// le ultime lette o salvate nel database (per tornarci uscendo dall'anteprima)
let saved: Prefs | null = null;
const COLUMNS =
  "sounds_on, volume, sound_on, sound_off, sound_chat, chat_sound_on, chat_font_pt, speech_color, action_color, chat_other_pt, chat_font_family, chat_line, name_color, chat_avatars, theme";

/** Mette la grafica sulla pagina e ne tiene una copia tecnica nel browser (per il primo disegno, vedi layout.tsx) */
function setThemeAttr(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("gdr_grafica", theme);
  } catch {
    // archivio del browser non disponibile: si vede il giorno finché non arrivano le preferenze
  }
}

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
  setThemeAttr(p.theme);
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

// Una sola lettura della propria riga per preferenze, skin e disponibilità:
// chi la chiede entro pochi secondi riceve la stessa risposta (meno chiamate a Supabase).
let rowRead: { at: number; promise: Promise<Record<string, unknown> | null> } | null = null;
const ROW_TTL_MS = 10_000;
export function readPrefsRow(supabase: SupabaseClient): Promise<Record<string, unknown> | null> {
  if (rowRead && Date.now() - rowRead.at < ROW_TTL_MS) return rowRead.promise;
  const promise = Promise.resolve(supabase.from("user_prefs").select("*").maybeSingle()).then(({ data, error }) => {
    if (error) rowRead = null;
    return (data as Record<string, unknown> | null) ?? null;
  });
  rowRead = { at: Date.now(), promise };
  return promise;
}
/** Dopo un salvataggio la prossima lettura torna al database */
export function forgetPrefsRow() {
  rowRead = null;
}

/** Le proprie preferenze (la RLS restituisce solo la propria riga) */
export async function loadPrefs(supabase: SupabaseClient): Promise<Prefs> {
  const row = await readPrefsRow(supabase);
  const keys = COLUMNS.split(",").map((c) => c.trim());
  const data = row ? Object.fromEntries(Object.entries(row).filter(([k]) => keys.includes(k))) : null;
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
  forgetPrefsRow();
  if (!error) saved = p;
  return !error;
}

// ----- Skin del sito (user_prefs.skin) -----
// Letta e salvata a parte: se la colonna non c'è ancora, resta la classica.
export type Skin = "classica" | "tramonto";
export const SKINS: { id: Skin; label: string; description: string; /** ha uno sfondo con l'immagine */ image: boolean }[] = [
  { id: "classica", label: "Classica", description: "Il crepuscolo viola di sempre.", image: false },
  { id: "tramonto", label: "Tramonto", description: "Prugna e bordeaux con luci calde, la città al tramonto sulla mappa.", image: true },
];

/** Mette la skin sulla pagina e ne tiene una copia tecnica nel browser (per il primo disegno, vedi layout.tsx) */
export function setSkinAttr(skin: Skin) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.skin = skin;
  try {
    localStorage.setItem("gdr_skin", skin);
  } catch {
    // archivio del browser non disponibile
  }
}

/** Sfondo con l'immagine (per le skin che ce l'hanno): attributo data-skin-image sulla pagina + copia tecnica */
export function setSkinImageAttr(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.dataset.skinImage = "on";
  else delete document.documentElement.dataset.skinImage;
  try {
    localStorage.setItem("gdr_skin_img", on ? "on" : "off");
  } catch {
    // archivio del browser non disponibile
  }
}

/** La propria skin dal database (classica se manca) e se mostrare lo sfondo con l'immagine */
export async function loadSkin(supabase: SupabaseClient): Promise<{ skin: Skin; image: boolean }> {
  const row = await readPrefsRow(supabase);
  const skin: Skin = row?.skin === "tramonto" ? "tramonto" : "classica";
  const image = Boolean(row?.skin_image);
  setSkinAttr(skin);
  setSkinImageAttr(image);
  return { skin, image };
}

/** Accende o spegne lo sfondo con l'immagine e lo salva subito */
export async function saveSkinImage(supabase: SupabaseClient, on: boolean) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await supabase.from("user_prefs").upsert({ user_id: data.user.id, skin_image: on, updated_at: new Date().toISOString() });
  forgetPrefsRow();
  if (!error) setSkinImageAttr(on);
  return !error;
}

/** Cambia la skin e la salva subito */
export async function saveSkin(supabase: SupabaseClient, skin: Skin) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await supabase.from("user_prefs").upsert({ user_id: data.user.id, skin, updated_at: new Date().toISOString() });
  forgetPrefsRow();
  if (!error) setSkinAttr(skin);
  return !error;
}

/** Cambia solo la grafica (giorno/notte) e la salva subito */
export async function saveTheme(supabase: SupabaseClient, theme: Theme) {
  setThemeAttr(theme);
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { error } = await supabase.from("user_prefs").upsert({ user_id: data.user.id, theme, updated_at: new Date().toISOString() });
  if (!error && saved) saved = { ...saved, theme };
  return !error;
}
