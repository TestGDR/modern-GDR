// Case e dormitori: tipi e testi condivisi.
// Prezzi, camere e regole stanno nel database: qui solo la presentazione.

export type DormRoomKind = "singola" | "doppia";

export const ROOM_KIND_LABEL: Record<DormRoomKind, string> = {
  singola: "Singola",
  doppia: "Doppia",
};

/** Posti di una camera */
export const ROOM_BEDS: Record<DormRoomKind, number> = { singola: 1, doppia: 2 };

export type Dorm = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  active: boolean;
  sort_order: number;
};

export type DormRoom = {
  id: string;
  dorm_id: string;
  name: string;
  kind: DormRoomKind;
  description: string;
  active: boolean;
  sort_order: number;
};

export type DormResident = {
  character_id: string;
  room_id: string;
  since: string;
  character: { id: string; name: string; sex: "M" | "F" | "X" | null; avatar_url: string | null } | null;
};

export type HouseType = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  /** null = non si vende */
  buy_price: number | null;
  /** null = non si affitta (al mese) */
  rent_price: number | null;
  /** Spese mensili di chi la compra (tasse, condominio, manutenzione) */
  owner_upkeep: number;
  active: boolean;
  sort_order: number;
};

export type HomeMode = "proprieta" | "affitto";

export type CharacterHome = {
  id: number;
  character_id: string;
  type_id: string | null;
  name: string;
  image_url: string | null;
  mode: HomeMode;
  price_paid: number;
  rent: number;
  /** spese mensili (case di proprietà) */
  upkeep: number;
  address: string;
  location_id: string | null;
  description: string;
  created_at: string;
};

/** Costi del college per il proprio personaggio (college_costs) */
export type CollegeCosts = {
  /** va all'università (paga la retta se non ha la borsa) */
  student: boolean;
  scholarship: boolean;
  /** retta al mese (0 con la borsa) */
  tuition: number;
  doppia: number;
  singola: number;
};

/** Ordine per sort_order e poi per nome (le camere "2" prima di "10") */
export function bySortThenName<T extends { sort_order: number; name: string }>(a: T, b: T) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name, "it", { numeric: true });
}
