// Social stile Instagram: tipi e regole condivise (browser).

import { firstName } from "@/lib/format";

export type MediaType = "image" | "video" | "youtube";
export type Media = { type: MediaType; url: string };

/** Reazioni ammesse (uguali al vincolo del database) */
export const REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👏"] as const;
export type Reaction = (typeof REACTIONS)[number];

/** Personaggio come appare nel social */
export type SocialPerson = {
  id: string;
  name: string;
  avatar_url: string | null;
  social: {
    handle: string;
    bio?: string;
    /** pubblico PNG (cresce e cala da solo ogni giorno) e follower comprati (crescono con la fama, non calano) */
    npc_followers?: number;
    bought_followers?: number;
    /** follower del background di fama (Influencer…): fissi */
    bg_followers?: number;
    boost_until?: string | null;
    boost_mult?: number;
  } | null;
};

export type SocialPost = {
  id: string;
  character_id: string;
  body: string;
  media: Media[];
  location: string | null;
  created_at: string;
  /** ultima modifica (testo, luogo o foto) */
  edited_at?: string | null;
  author: SocialPerson | null;
  social_reactions: { character_id: string; emoji: Reaction; character?: { name: string; social: { handle: string } | null } | null }[];
  /** like del pubblico PNG (arrivano nei primi giorni) */
  npc_likes?: number;
  social_comments: { count: number }[];
  social_tags: { character: SocialPerson | null }[];
  /** evento a cui è collegato il post (foto dall'evento) */
  event_id?: string | null;
  event?: { id: string; title: string } | null;
};

export type SocialComment = {
  id: number;
  body: string;
  created_at: string;
  edited_at?: string | null;
  character_id: string;
  /** risposta a questo commento */
  reply_to_id?: number | null;
  author: SocialPerson | null;
};

export type SocialDm = {
  id: number;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type SocialNotification = {
  id: number;
  kind: "follow" | "reaction" | "comment" | "tag" | "mention" | "reply" | "evento_invito" | "evento_nuovo" | "evento_partecipa" | "evento_promemoria";
  post_id: string | null;
  event_id?: string | null;
  detail: string;
  created_at: string;
  read_at: string | null;
  actor: SocialPerson | null;
};

/** Evento del social (social_events) */
export type EventVisibility = "pubblico" | "follower" | "invito";
export type GuestStatus = "invitato" | "partecipo" | "forse" | "non_vengo";
export type SocialEvent = {
  id: string;
  character_id: string;
  title: string;
  description: string;
  cover_url: string | null;
  starts_at: string;
  ends_at: string | null;
  room_id: string | null;
  place: string;
  visibility: EventVisibility;
  has_password: boolean;
  created_at: string;
  organizer: SocialPerson | null;
  room: { id: string; name: string } | null;
  social_event_guests: { character_id: string; status: GuestStatus }[];
};
export type EventGuest = { character_id: string; status: GuestStatus; character: SocialPerson | null };

export const VISIBILITY_LABEL: Record<EventVisibility, string> = { pubblico: "Pubblico", follower: "Solo follower", invito: "Su invito" };
export const GUEST_LABEL: Record<GuestStatus, string> = { invitato: "Invitato", partecipo: "Partecipa", forse: "Forse", non_vengo: "Non viene" };

/** "sabato 8 novembre, 21:00" in ora italiana */
export function eventWhen(iso: string, end?: string | null) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" });
  const t = (x: Date) => x.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  return `${day}, ${t(d)}${end ? ` – ${t(new Date(end))}` : ""}`;
}

/** Valore per <input type=datetime-local> in ora italiana */
export function toRomeInput(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const time = d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  return `${date}T${time}`;
}

/** Da <input type=datetime-local> (ora italiana) a ISO */
export function fromRomeInput(v: string) {
  const guess = new Date(`${v}:00Z`);
  const rome = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (rome.getTime() - utc.getTime())).toISOString();
}

/** Campi da chiedere al database per un personaggio */
export const PERSON = "id, name, avatar_url, social:social_profiles(handle, bio, npc_followers, bought_followers, bg_followers, boost_until, boost_mult)";
export const EVENT_SELECT = `id, character_id, title, description, cover_url, starts_at, ends_at, room_id, place, visibility, has_password, created_at, organizer:characters!social_events_character_id_fkey(${PERSON}), room:rooms(id, name), social_event_guests(character_id, status)`;
export const POST_SELECT = `id, character_id, body, media, location, created_at, edited_at, npc_likes, author:characters!social_posts_character_id_fkey(${PERSON}), social_reactions(character_id, emoji, character:characters(name, social:social_profiles(handle))), social_comments(count), social_tags(character:characters(${PERSON})), event_id, event:social_events(id, title)`;

/** Nome visibile: @nome se c'è, altrimenti il nome del personaggio */
export function handleOf(p: SocialPerson | null | undefined) {
  // senza @nome: solo il nome del personaggio
  return p?.social?.handle ? `@${p.social.handle}` : firstName(p?.name) || "utente";
}

/** @nome suggerito dal nome del personaggio: "Lena Moreno" → "lena.moreno" */
export function suggestHandle(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 30);
}

export const HANDLE_RE = /^[a-z0-9._]{3,30}$/;

/** Codice del video YouTube da un link (watch, youtu.be, shorts, embed) */
export function youtubeId(url: string) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

/** Riconosce il tipo di un link: YouTube, video (.mp4, .webm…) o immagine */
export function detectMedia(raw: string): Media | null {
  const url = raw.trim();
  if (!/^https:\/\/\S+$/.test(url) || url.length > 500) return null;
  if (youtubeId(url)) return { type: "youtube", url };
  if (/\.(mp4|webm|mov|m4v|ogv)(\?\S*)?$/i.test(url)) return { type: "video", url };
  return { type: "image", url };
}

/** Testo del post con @nomi e #tag evidenziati */
export function splitMentions(text: string) {
  const parts: { text: string; handle?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(/@([a-z0-9._]{3,30})/g)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], handle: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** "3 min", "2 h", "5 g", poi la data */
export function socialTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} g`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
}
