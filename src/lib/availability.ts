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

export function writeAvailability(value: Availability) {
  document.cookie = `${AVAILABILITY_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
