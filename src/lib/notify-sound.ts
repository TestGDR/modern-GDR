"use client";

// Suoni d'avviso (dal Westeros: notify-sound.ts). File mp3 in public/sounds,
// divisi in tre gruppi: ON (messaggi tra personaggi), OFF (messaggi fuori
// gioco, ticket, SISTEMA) e chat. Quale suono, il volume e se i suoni sono
// accesi lo decidono le preferenze dell'utente (src/lib/prefs.ts).
// I browser non lasciano suonare una pagina finché l'utente non ha cliccato o
// premuto un tasto: fino ad allora il suono semplicemente non parte.

export type SoundGroup = "on" | "off" | "chat";
export type SoundDef = { id: string; label: string; groups: SoundGroup[]; file: string };

// Per i messaggi ON si usano i suoni della chat finché non ce ne sono di propri
export const SOUNDS: SoundDef[] = [
  { id: "file-bip1", label: "Bip 1", groups: ["off"], file: "/sounds/bip1.mp3" },
  { id: "file-blip", label: "Blip", groups: ["off"], file: "/sounds/blip.mp3" },
  { id: "file-bip3", label: "Bip 3", groups: ["off"], file: "/sounds/bip3.mp3" },
  { id: "file-chat1", label: "Chat 1", groups: ["chat", "on"], file: "/sounds/chat1.mp3" },
  { id: "file-chat2", label: "Chat 2", groups: ["chat", "on"], file: "/sounds/chat2.mp3" },
  { id: "file-chat3", label: "Chat 3", groups: ["chat", "on"], file: "/sounds/chat3.mp3" },
];

export const soundsOf = (group: SoundGroup) => SOUNDS.filter((s) => s.groups.includes(group));
/** Se un suono salvato non esiste più, vale il primo della sua lista */
export const soundOr = (id: string, group: SoundGroup) => (soundsOf(group).some((s) => s.id === id) ? id : soundsOf(group)[0].id);

// Il primo clic o tasto "sblocca" l'audio
let unlocked = false;
if (typeof window !== "undefined") {
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

let volume = 0.8;
let prefs = { on: true, soundOn: "file-chat2", soundOff: "file-bip1", soundChat: "file-chat1", chatOn: true };

/** Impostate da applyPrefs (src/lib/prefs.ts) */
export function setSoundPrefs(p: typeof prefs & { volume: number }) {
  const { volume: v, ...rest } = p;
  prefs = rest;
  volume = Math.min(1, Math.max(0, v / 100));
}

function playFile(src: string) {
  if (typeof window === "undefined" || volume <= 0) return;
  const a = new Audio(src);
  a.volume = volume;
  a.play().catch(() => {});
}

/** Suona un suono preciso (pulsante "prova"): anche con i suoni spenti */
export function playSound(id: string) {
  const s = SOUNDS.find((x) => x.id === id);
  if (s) playFile(s.file);
}

/** Suono di un avviso, secondo le preferenze (niente se i suoni sono spenti) */
export function playEvent(kind: SoundGroup) {
  if (!prefs.on || !unlocked) return;
  if (kind === "chat" && !prefs.chatOn) return;
  const chosen = kind === "on" ? prefs.soundOn : kind === "off" ? prefs.soundOff : prefs.soundChat;
  playSound(soundOr(chosen, kind));
}

/** Avviso dei messaggi non letti */
export function playMessageChime(kind: "on" | "off" = "off") {
  playEvent(kind);
}

/**
 * Ripete una funzione anche con la scheda in secondo piano: i timer della pagina
 * vengono rallentati dal browser, quelli di un Web Worker no.
 * Restituisce la funzione per fermarlo.
 */
export function everyEvenInBackground(fn: () => void, ms: number): () => void {
  if (typeof window === "undefined") return () => {};
  try {
    const src = `setInterval(function () { postMessage(0); }, ${Math.max(1000, Math.round(ms))});`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const worker = new Worker(url);
    worker.onmessage = () => fn();
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const timer = setInterval(fn, ms);
    return () => clearInterval(timer);
  }
}
