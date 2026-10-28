// Piccole funzioni di formattazione condivise da server e browser.
// Orari mostrati con il fuso italiano, così server e browser coincidono.

const TIME_ZONE = "Europe/Rome";

/** Iniziali del nome: "Lena Moreno" → "LM" */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Ora "19:42" */
export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

/** Data breve "28 ott, 19:42" */
export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

/** "adesso", "5 min fa", "3 h fa", poi la data */
export function timeAgo(iso: string, now: Date) {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h fa`;
  return formatDateTime(iso);
}

/** Un personaggio è online se si è visto negli ultimi 10 minuti */
export const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export function isOnline(lastSeenAt: string | null, now: Date) {
  return !!lastSeenAt && now.getTime() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

/** Sfumatura "cartolina" stabile, scelta in base a un id */
const gradients = [
  "from-violet via-flamingo to-peach",
  "from-dusk via-orchid to-sand",
  "from-violet via-lavender to-mint",
  "from-orchid via-flamingo to-sand",
  "from-dusk via-violet to-peach",
];

export function gradientFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return gradients[hash % gradients.length];
}
