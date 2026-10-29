// Disponibilità scelta dal giocatore (dal Westeros: availability.ts).
// Sta nel cookie gdr_disponibilita: la leggono sia il server sia il browser.
export type Availability = "disponibile" | "cerca" | "occupato";

export const AVAILABILITY: Record<Availability, { label: string; dot: string }> = {
  disponibile: { label: "Disponibile", dot: "bg-mint shadow-[0_0_6px_var(--mint)]" },
  cerca: { label: "In cerca di gioco", dot: "bg-peach shadow-[0_0_6px_var(--peach)]" },
  occupato: { label: "Occupato", dot: "bg-flamingo shadow-[0_0_6px_var(--flamingo)]" },
};

export const AVAILABILITY_COOKIE = "gdr_disponibilita";

export function isAvailability(value: unknown): value is Availability {
  return value === "disponibile" || value === "cerca" || value === "occupato";
}

/** Disponibilità salvata nel browser */
export function readAvailability(): Availability {
  if (typeof document === "undefined") return "disponibile";
  const match = document.cookie.match(new RegExp(`(?:^|; )${AVAILABILITY_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isAvailability(value) ? value : "disponibile";
}

const NOTE_KEY = "gdr_messaggio_off";

/** Messaggio OFF personale dei presenti (salvato nel browser) */
export function readPresenceNote(): string {
  try {
    return typeof localStorage === "undefined" ? "" : (localStorage.getItem(NOTE_KEY) ?? "").slice(0, 80);
  } catch {
    return "";
  }
}

export function writePresenceNote(value: string) {
  try {
    if (value) localStorage.setItem(NOTE_KEY, value.slice(0, 80));
    else localStorage.removeItem(NOTE_KEY);
  } catch {
    // archivio del browser non disponibile: il messaggio vale solo finché la pagina è aperta
  }
}

export function writeAvailability(value: Availability) {
  document.cookie = `${AVAILABILITY_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
