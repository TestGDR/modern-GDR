// Sistema di Fama: tipi letti dalle funzioni fame_* del database.
// Numeri, cataloghi e livelli stanno nel database (Gestione → Fama): qui solo la presentazione.

export type FameKind = "fama" | "infamia";

/** Livello e barra (fame_level_info) */
export type FameLevelInfo = {
  points: number;
  id: string;
  name: string;
  icon: string;
  color: string;
  min: number;
  next_name: string | null;
  next_min: number | null;
  missing: number | null;
  pct: number;
};

export type FameBackground = { id: string; name: string; description: string; category: string; cost: number | null; status: "approvata" | "in_attesa" | "rifiutata" };
export type FameBadge = {
  id: string;
  badge_id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  kind: FameKind;
  reason: string;
  date: string;
  rarity: string | null;
  color: string;
};
export type FameEntry = { id: string; title: string; description: string; points: number; kind: FameKind; public: boolean; date: string };

/** Tutto per la scheda (fame_overview) */
export type FameOverview = {
  fame: FameLevelInfo | null;
  infamy: FameLevelInfo | null;
  converted: boolean;
  pf_pool: number;
  pf_converted: number;
  px_from_conversion: number;
  is_staff: boolean;
  is_owner: boolean;
  background: FameBackground[];
  badges: FameBadge[];
  entries: FameEntry[];
};

/** Creazione: PF, regole e catalogo (fame_creation_state) */
export type FameCreationState = {
  pool: number;
  spent: number;
  converted: boolean;
  px_from_conversion: number;
  rate: number;
  max_item: number;
  max_category: number;
  custom: boolean;
  items: { id: string; name: string; description: string; category: string; cost: number }[];
  mine: { id: string; item_id: string | null; name: string; description: string; category: string; cost: number | null; status: FameBackground["status"]; note: string; custom: boolean }[];
};

/** Un'icona è un link https (immagine) o un'emoji */
export function isImageIcon(icon: string) {
  return icon.startsWith("https://");
}

export function signedPoints(n: number) {
  return n > 0 ? `+${n}` : String(n);
}
