// Mercato, inventario e alterazioni: tipi e testi condivisi.
// Prezzi, cariche e effetti stanno nel database (market_items): qui solo la presentazione.

export type MarketCategory = "animali" | "veicoli" | "gioielli" | "elettronica" | "abbigliamento" | "casa" | "alcolici" | "sigarette" | "droghe" | "altro";

export const CATEGORY_LABEL: Record<MarketCategory, string> = {
  animali: "Animali",
  veicoli: "Veicoli",
  gioielli: "Gioielli",
  elettronica: "Elettronica",
  abbigliamento: "Abbigliamento",
  casa: "Casa",
  alcolici: "Alcolici",
  sigarette: "Sigarette",
  droghe: "Droghe",
  altro: "Altro",
};

export const ATTRIBUTE_CODES = ["INT", "RIF", "VIG", "EMP", "PRE"] as const;

export type AlterationStage = { name: string; hours: number; mods: Record<string, number>; text: string };
export type ItemEffect = { type: "alcol" | "droga"; cd: number; stages: AlterationStage[]; aftermath: AlterationStage | null };

export type MarketItem = {
  id: string;
  name: string;
  description: string;
  category: MarketCategory;
  price: number;
  image_url: string | null;
  black_market: boolean;
  charges: number | null;
  use_text: string;
  effect: ItemEffect | null;
  active: boolean;
  sort_order: number;
};

export type CharacterItem = {
  id: number;
  character_id: string;
  item_id: string | null;
  name: string;
  category: MarketCategory;
  image_url: string | null;
  charges_left: number | null;
  use_text: string;
  effect: ItemEffect | null;
  black_market: boolean;
  /** "con sé": portato dietro, visibile a tutti in scheda */
  carried?: boolean;
  acquired_at: string;
};

/** Alterazione in corso (dalla funzione character_alterations_get) */
export type ActiveAlteration = AlterationStage & {
  kind: "alcol" | "droga";
  source: string;
  phase: "stadio" | "postumi";
  stage?: number;
  until: string;
};

/** "RIF −1, INT −2" */
export function modsText(mods: Record<string, number> | undefined) {
  return Object.entries(mods ?? {})
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${k} ${v > 0 ? "+" : "−"}${Math.abs(v)}`)
    .join(", ");
}

/** Tempo che manca, in ore e minuti */
export function timeLeft(iso: string, now: number) {
  const min = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}
