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

/** Voce degli elenchi della scheda (indirizzi, anni, club, nazionalità) */
export type SheetOption = {
  id: string;
  kind: "indirizzo" | "anno" | "club";
  name: string;
  sort_order: number;
  active: boolean;
};

/** Vantaggio, svantaggio, tratto o tenore di vita */
export type CreationOption = {
  id: string;
  kind: "vantaggio" | "svantaggio" | "tratto" | "tenore";
  name: string;
  /** Positivo se costa PX, negativo se ne dà */
  cost_px: number;
  description: string;
  roll_modifier: number | null;
  roll_skill_id: string | null;
  incompatible_ids: string[];
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

/** Mappa di gioco (Miami, in futuro p. es. il campus) */
export type GameMap = {
  id: string;
  name: string;
  description: string;
  /** Senza immagine si vede la Miami disegnata */
  image_url: string | null;
  sort_order: number;
  active: boolean;
};

/** Quartiere (tabella locations): un punto sulla mappa, x/y in percentuale */
export type District = {
  id: string;
  map_id: string;
  name: string;
  tagline: string | null;
  description: string;
  x: number;
  y: number;
  /** Classi Tailwind della sfumatura (es. "from-violet via-flamingo to-sand") */
  gradient: string;
  sort_order: number;
};

/** Gruppo di chat dentro un quartiere ("Locali", "Case"…) */
export type RoomGroup = {
  id: string;
  location_id: string;
  name: string;
  sort_order: number;
};

export type RoomAccess = "pubblica" | "su_invito";

/** Chat di gioco dentro un quartiere */
export type Room = {
  id: string;
  location_id: string;
  group_id: string | null;
  name: string;
  description: string;
  image_url: string | null;
  is_open: boolean;
  access: RoomAccess;
  /** Chat su invito: il personaggio che invita e allontana */
  owner_character_id: string | null;
  cleared_at: string | null;
  master_min: number | null;
  master_max: number | null;
  master_by: string | null;
  sort_order: number;
};

export type MessageKind = "azione" | "fuori_gioco" | "master" | "dado" | "sistema" | "sussurro";

/** Dettagli di un tiro Interlock */
export type RollData = {
  die: number;
  extra: number;
  attribute: string;
  attribute_value: number;
  skill: string | null;
  skill_level: number | null;
  modifiers: number;
  total: number;
};

/** Messaggio della chat di gioco */
export type Message = {
  id: number;
  room_id: string;
  character_id: string;
  author_id: string | null;
  character_name: string;
  kind: MessageKind;
  content: string;
  recipient: string | null;
  recipient_id: string | null;
  roll_data: RollData | null;
  edited_at: string | null;
  created_at: string;
};

/** Impostazioni della chat (Gestione → Chat) */
export type ChatSettings = {
  max_length: number;
  ttl_minutes: number;
  idle_minutes: number;
};

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
  sex: "M" | "F" | "X" | null;
  birth_date: string | null;
  /** Testo libero scritto dal giocatore */
  nationality: string | null;
  study_track_id: string | null;
  year_id: string | null;
  club_id: string | null;
  /** Ultimo passaggio raggiunto nella creazione (1-6) */
  creation_step: number;
  last_seen_at: string | null;
  created_at: string;
  status: CharacterStatus;
  rejection_reason: string | null;
  /** PX non spesi */
  px: number;
};

/** Versione ridotta del personaggio, usata in elenchi e messaggi */
export type CharacterSummary = Pick<Character, "id" | "name" | "occupation" | "last_seen_at">;

/** Canale dei messaggi: ON tra personaggi, OFF tra giocatori */
export type Channel = "on" | "off";

/** Messaggio diretto tra due utenti */
export type PrivateMessage = {
  id: number;
  kind: Channel;
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
  /** Discussione importante: evidenziata nell'elenco */
  is_important: boolean;
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
  /** Post segnalato a tutti dallo staff */
  highlighted_at: string | null;
  highlighted_by: string | null;
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

/** Notizia dello staff (solo OFF) */
export type News = {
  id: string;
  title: string;
  body: string;
  author_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketStatus = "attesa" | "in_carico" | "sospeso" | "chiuso";

export type TicketSection = {
  id: string;
  name: string;
  instructions: string;
  sort_order: number;
  active: boolean;
};

export type Ticket = {
  id: string;
  title: string;
  section_id: string | null;
  opened_by: string | null;
  opener_name: string;
  status: TicketStatus;
  assigned_to: string | null;
  assigned_name: string | null;
  created_at: string;
  last_message_at: string;
  last_author_name: string;
};

export type TicketMessage = {
  id: number;
  ticket_id: string;
  author_id: string | null;
  author_name: string;
  from_staff: boolean;
  body: string;
  roll_data: RollData | null;
  created_at: string;
};

/** Risultato standard delle Server Action usate nei moduli */
export type FormState = {
  error?: string;
  success?: string;
  /** Valori da rimettere nel modulo dopo un errore */
  values?: Record<string, string>;
};
