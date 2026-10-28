// Tipi delle righe del database Supabase (vedi supabase/migrations/).
// Se cambi una tabella, aggiorna anche questi tipi.

/** Livello utente (Amministratore, Master, Moderatore, Giocatore, Ospite…) */
export type UserLevel = {
  id: string;
  name: string;
  description: string;
  /** Colore del badge: se presente, il livello si mostra accanto al nome */
  color: string | null;
  rank: number;
  /** Chiavi dei permessi spuntati (registro in src/lib/permissions.ts) */
  permissions: string[];
  /** Amministratore: ha sempre tutti i permessi */
  is_admin: boolean;
  max_characters: number;
};

export type Profile = {
  id: string;
  username: string;
  level_id: string;
  created_at: string;
};

export type CharacterStatus = "bozza" | "in_attesa" | "approvata" | "rifiutata";

/** Caratteristica del sistema Interlock (INT, RIF, VIG, EMP, PRE…) */
export type Attribute = {
  id: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
};

export type Skill = {
  id: string;
  attribute_id: string;
  name: string;
  description: string;
  category: "Studio" | "Sport" | "Arti" | "Sociale" | "Pratico" | null;
  sort_order: number;
  active: boolean;
};

export type GameSetting = {
  key: string;
  value: number | number[] | string;
  kind: "number" | "numbers" | "level";
  label: string;
  description: string;
  sort_order: number;
};

export type District = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  map_x: number;
  map_y: number;
  gradient: string;
  sort_order: number;
};

export type Place = {
  id: string;
  district_id: string;
  slug: string;
  name: string;
  description: string | null;
  is_open: boolean;
  sort_order: number;
};

export type DistrictWithPlaces = District & { places: Place[] };

export type Character = {
  id: string;
  owner_id: string;
  name: string;
  age: number | null;
  occupation: string | null;
  district_id: string | null;
  quote: string | null;
  bio: string | null;
  avatar_url: string | null;
  /** Immagine grande della sezione Principale */
  cover_url: string | null;
  appearance: string | null;
  traits: string | null;
  skills: string | null;
  /** "Si sa che": ciò che in città si sa del personaggio */
  known_facts: string | null;
  relationships: string | null;
  equipment: string | null;
  physique: number;
  cunning: number;
  charisma: number;
  driving: number;
  last_seen_at: string | null;
  created_at: string;
  status: CharacterStatus;
  rejection_reason: string | null;
  /** PX non spesi */
  px: number;
};

/** Versione ridotta del personaggio, usata in elenchi e messaggi */
export type CharacterSummary = Pick<Character, "id" | "name" | "occupation" | "last_seen_at">;

export type ChatMessage = {
  id: number;
  place_id: string;
  character_id: string;
  author_id: string;
  action: string | null;
  speech: string | null;
  created_at: string;
};

export type PrivateMessage = {
  id: number;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type ForumBoard = {
  id: string;
  section_id: string;
  slug: string;
  name: string;
  description: string | null;
  staff_only: boolean;
  sort_order: number;
};

export type ForumSection = {
  id: string;
  title: string;
  is_on_game: boolean;
  sort_order: number;
  forum_boards: ForumBoard[];
};

export type ForumThread = {
  id: string;
  board_id: string;
  author_id: string;
  character_id: string | null;
  title: string;
  is_pinned: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
};

export type ForumPost = {
  id: number;
  thread_id: string;
  author_id: string;
  character_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
};

export type SocialPost = {
  id: string;
  character_id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  location: string | null;
  created_at: string;
};

export type SocialComment = {
  id: number;
  post_id: string;
  character_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type CityNews = {
  id: string;
  title: string;
  body: string | null;
  district_id: string | null;
  published_at: string;
};

/** Risultato standard delle Server Action usate nei moduli */
export type FormState = {
  error?: string;
  success?: string;
  /** Valori da rimettere nel modulo dopo un errore */
  values?: Record<string, string>;
};
