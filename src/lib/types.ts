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
  last_login_at: string | null;
  last_played_at: string | null;
  /** Quando ha usato il cambio di nome (una volta sola); null = ancora disponibile */
  name_changed_at: string | null;
  /** Sospeso fino a questa data ("infinity" = per sempre) */
  banned_until: string | null;
  ban_reason: string;
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
  /** Patrimonio: entrata a ogni accredito (mensile) */
  salary: number;
  /** Patrimonio: uscita di mantenimento a ogni accredito */
  upkeep: number;
  /** Patrimonio: soldi sul conto all'approvazione */
  initial_amount: number;
  sort_order: number;
  active: boolean;
};

export type GameSetting = {
  key: string;
  value: number | number[] | string;
  kind: "number" | "numbers" | "level" | "decimal";
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

/** "password": chat privata creata dalla mappa con una password (non compare negli elenchi) */
export type RoomAccess = "pubblica" | "su_invito" | "password";

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

export type MessageKind = "azione" | "fuori_gioco" | "master" | "dado" | "sistema" | "sussurro" | "combattimento";

/* ---------- Combattimento (tutto scritto dalle funzioni combat_*) ---------- */
export type CombatZone = "testa" | "tronco" | "braccio" | "gamba";
export type CombatActionKind = "normale" | "veloce" | "forte" | "mirato" | "spingere" | "afferrare";
export type CombatDefense = "schivare" | "parare" | "incassare";
export type WoundSeverity = "lieve" | "moderata" | "grave" | "molto_grave";
export type HealthStatus = "ok" | "fuori_combattimento" | "emergenza_medica";

export type Combat = {
  id: string;
  room_id: string;
  status: "in_corso" | "chiuso";
  round: number;
  turn_order: string[];
  turn_index: number;
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
};
export type CombatParticipant = {
  combat_id: string;
  character_id: string;
  name: string;
  initiative: number;
  rif: number;
  out: boolean;
  condition: "a_terra" | "trattenuto" | null;
  condition_by: string | null;
  joined_at: string;
};
export type CombatAction = {
  id: number;
  combat_id: string;
  round: number;
  attacker_id: string;
  target_id: string;
  action: CombatActionKind;
  zone_aimed: CombatZone | null;
  status: "attesa_difesa" | "risolta" | "annullata";
  defense: CombatDefense | null;
  outcome: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};
export type Wound = { id: string; zone: CombatZone; severity: WoundSeverity; penalty: number; created_at: string; heals_at: string | null };
/** Salute del personaggio (character_health_get) */
export type CharacterHealth = { hp: number; max: number; rec: number; status: HealthStatus; wounds: Wound[] };

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
  /** Immagine grande della sezione Principale (computer, 640x560) */
  cover_url: string | null;
  /** Immagine verticale della sezione Principale sul cellulare (9:16, circa 360x640) */
  cover_mobile_url: string | null;
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
  /** Prestavolto: unico, una volta registrato lo cambia solo lo staff */
  face_claim: string | null;
  /** Prestatalento: unico, registrato una volta (poi lo cambia lo staff) */
  talent_claim: string | null;
  /** Aspetto fisico, scritto dal giocatore in Scheda → Dati */
  height: string | null;
  weight: string | null;
  eye_color: string | null;
  hair_color: string | null;
  /** Minor (un indirizzo di studio); il Major è study_track_id */
  minor_id: string | null;
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
  /** Chi la legge: tutti, solo alcuni livelli (ruoli) o solo alcuni gruppi (corporazioni) */
  access: ForumAccess;
  level_ids: string[];
  group_ids: string[];
  sort_order: number;
};

export type ForumAccess = "pubblica" | "livelli" | "gruppi";

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
  /** Ticket di approvazione: la scheda di cui parla */
  character_id: string | null;
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

/** Situazione del conto in banca (bank_overview) */
export type BankOverview = {
  /** Può essere negativo (mantenimento) */
  balance: number;
  /** Entrate a ogni accredito: patrimonio + lavori + gruppi */
  income: number;
  income_parts: { label: string; amount: number }[];
  /** Mantenimento del patrimonio a ogni accredito */
  upkeep: number;
  period_days: number;
  /** Giorno del prossimo accredito (AAAA-MM-GG) */
  next_on: string;
};

export type BankTransaction = {
  id: number;
  character_id: string;
  amount: number;
  kind: "stipendio" | "bonifico" | "staff" | "mantenimento" | "iniziale";
  description: string;
  counterpart_id: string | null;
  balance_after: number;
  created_at: string;
};

/** Risultato standard delle Server Action usate nei moduli */
export type FormState = {
  error?: string;
  success?: string;
  /** Valori da rimettere nel modulo dopo un errore */
  values?: Record<string, string>;
};

/* ---------- Università (sistema accademico) ---------- */
export type ClassStanding = "freshman" | "sophomore" | "junior" | "senior";
export type AcademicStatus = "good_standing" | "probation" | "suspended" | "dismissed" | "graduated";
export type TermStatus = "registration_open" | "in_progress" | "simulated" | "published";
export type Effort = "minimal" | "normal" | "intense";

export type Course = {
  id: string;
  code: string;
  name: string;
  department: string;
  credits: number;
  level: 100 | 200 | 300 | 400;
  attribute_id: string;
  skill_id: string | null;
  cd_modifier: number;
  description: string;
  active: boolean;
};
export type CoursePrerequisite = { course_id: string; prerequisite_id: string; min_grade: string };
export type AcademicTerm = {
  id: string;
  academic_year: string;
  semester: "fall" | "spring";
  status: TermStatus;
  withdraw_open: boolean;
  created_at: string;
  simulated_at: string | null;
  published_at: string | null;
};
export type ExamRoll = {
  type: "coursework" | "midterm" | "final";
  attr: number;
  skill: number;
  d10: number;
  crit: "none" | "success" | "failure";
  extra: number | null;
  mods: { tratti: number; impegno: number; carico: number; ripetizione: number; master: number; nota_master: string | null; totale: number };
  total: number;
  cd: number;
  margin: number;
  score: number;
};
export type EnrollmentView = {
  id: number;
  course_id: string;
  code: string;
  name: string;
  credits: number;
  level: number;
  status: "enrolled" | "withdrawn" | "completed";
  effort: Effort;
  letter_grade: string | null;
  grade_points?: number | null;
  final_score: number | null;
  is_retake: boolean;
  counts_in_gpa?: boolean;
  master_modifier: number | null;
  master_note: string | null;
  rolls: ExamRoll[];
};
export type StudentRecord = {
  credits_earned: number;
  cumulative_gpa: number | null;
  class_standing: ClassStanding;
  academic_status: AcademicStatus;
  probation_count?: number;
  honors?: string | null;
  start_credits?: number;
  new?: boolean;
};
export type TermReport = {
  credits_attempted: number;
  credits_earned: number;
  term_gpa: number | null;
  cumulative_gpa_after: number | null;
  credits_total_after: number;
  standing_before: AcademicStatus;
  standing_after: AcademicStatus;
  class_standing_after: ClassStanding;
  deans_list: boolean;
  graduated: boolean;
  honors: string | null;
  report_text: string;
};
/** academic_overview: la carriera di un personaggio */
export type AcademicOverview = {
  character: { id: string; name: string; status: string; major_id: string | null; major: string | null; year: string | null; graduate: boolean };
  staff: boolean;
  record: StudentRecord;
  term: { id: string; label: string; status: TermStatus; withdraw_open: boolean } | null;
  current: EnrollmentView[];
  history: { term_id: string; label: string; status: TermStatus; report: TermReport | null; courses: EnrollmentView[] }[];
  /** ultimo voto pubblicato di ogni corso (grade points) */
  passed: Record<string, number>;
  /** corsi obbligatori del Major */
  required: string[];
};
/** academic_term_view: gli studenti di un semestre (staff) */
export type TermStudent = {
  character_id: string;
  name: string;
  record: (StudentRecord & { character_id: string }) | null;
  report: TermReport | null;
  courses: EnrollmentView[] | null;
};
