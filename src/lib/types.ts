// Tipi delle righe del database Supabase (vedi supabase/migrations/).
// Se cambi una tabella, aggiorna anche questi tipi.

export type UserRole = "player" | "master" | "admin";

export type Profile = {
  id: string;
  username: string;
  role: UserRole;
  created_at: string;
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
  physique: number;
  cunning: number;
  charisma: number;
  driving: number;
  last_seen_at: string | null;
  created_at: string;
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
