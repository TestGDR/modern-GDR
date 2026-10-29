// Social stile Instagram: tipi e regole condivise (browser).

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
  social: { handle: string; bio?: string } | null;
};

export type SocialPost = {
  id: string;
  character_id: string;
  body: string;
  media: Media[];
  location: string | null;
  created_at: string;
  author: SocialPerson | null;
  social_reactions: { character_id: string; emoji: Reaction }[];
  social_comments: { count: number }[];
  social_tags: { character: SocialPerson | null }[];
};

export type SocialComment = {
  id: number;
  body: string;
  created_at: string;
  character_id: string;
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
  kind: "follow" | "reaction" | "comment" | "tag";
  post_id: string | null;
  detail: string;
  created_at: string;
  read_at: string | null;
  actor: SocialPerson | null;
};

/** Campi da chiedere al database per un personaggio */
export const PERSON = "id, name, avatar_url, social:social_profiles(handle, bio)";
export const POST_SELECT = `id, character_id, body, media, location, created_at, author:characters(${PERSON}), social_reactions(character_id, emoji), social_comments(count), social_tags(character:characters(${PERSON}))`;

/** Nome visibile: @nome se c'è, altrimenti il nome del personaggio */
export function handleOf(p: SocialPerson | null | undefined) {
  return p?.social?.handle ? `@${p.social.handle}` : (p?.name ?? "utente");
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
