// Telefono: tipi e formati, usati da server e browser.

/** Numero del telefono di un personaggio */
export type PhoneNumber = {
  id: string;
  character_id: string;
  digits: string;
  display_name: string;
  avatar_url: string | null;
  status_text: string;
};

/** Profilo pubblico di un numero (funzione phone_directory) */
export type PhoneProfile = {
  number_id: string;
  digits: string;
  display_name: string;
  avatar_url: string | null;
  status_text: string;
};

export type PhoneThread = {
  id: string;
  is_group: boolean;
  name: string;
  avatar_url: string | null;
  created_by: string | null;
  last_message_at: string;
};

export type PhoneMember = { thread_id: string; number_id: string; last_read_at: string };

/** Riga dell'elenco delle chat (funzione phone_inbox): ultimo messaggio e non letti */
export type PhoneInbox = {
  thread_id: string;
  last_id: number | null;
  last_sender: string | null;
  last_mode: PhoneMode | null;
  last_body: string | null;
  last_at: string | null;
  last_deleted: boolean;
  unread: number;
  /** Quando l'ho svuotata (null = mai) */
  cleared_at: string | null;
  /** Chat a due eliminata dall'altra persona: non si scrive più */
  closed: boolean;
};

export type PhoneMode = "testo" | "vocale" | "chiamata" | "videochiamata" | "evento";

export type PhoneMessage = {
  id: number;
  thread_id: string;
  sender_number_id: string | null;
  mode: PhoneMode;
  body: string;
  created_at: string;
  /** Eliminato dal mittente: al posto del testo "Messaggio eliminato" */
  deleted_at?: string | null;
};

export type PhoneCallStatus = "squilla" | "attiva" | "terminata" | "rifiutata" | "persa";

export type PhoneCall = {
  id: string;
  thread_id: string;
  caller_number_id: string | null;
  callee_number_id: string | null;
  video: boolean;
  status: PhoneCallStatus;
  created_at: string;
  answered_at: string | null;
};

export type PhoneContact = { id: string; number_id: string; digits: string; name: string };
export type PhoneBlock = { number_id: string; digits: string };

/** Stato per l'icona "Telefono" (funzione phone_state) */
export type PhoneState = {
  unread: number;
  call: {
    id: string;
    thread_id: string;
    status: "squilla" | "attiva";
    video: boolean;
    incoming: boolean;
    my_number: string;
    other_name: string;
    other_digits: string;
  } | null;
};

/** 13054821937 → "+1 (305) 482-1937" */
export function formatPhone(digits: string) {
  return /^1\d{10}$/.test(digits) ? `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}` : digits;
}

/** Numero scritto in qualsiasi modo → solo cifre con il prefisso 1 (o null) */
export function normalizePhone(input: string) {
  const d = input.replace(/\D/g, "");
  if (/^\d{10}$/.test(d)) return `1${d}`;
  if (/^1\d{10}$/.test(d)) return d;
  return null;
}

/** Archivio delle foto del profilo */
export const PHONE_BUCKET = "telefono";
