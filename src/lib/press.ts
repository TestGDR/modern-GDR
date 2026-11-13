// Campus Wire: giornale e podcast del college (testi e tipi condivisi)

export const PRESS_NAME = "Campus Wire";
export const PRESS_TAGLINE = "Il giornale e i podcast del college";

export type PressKind = "articolo" | "podcast";
export type PressStatus = "bozza" | "in_revisione" | "pubblicato" | "rifiutato";

export const PRESS_SECTIONS = {
  campus: "Vita nel campus",
  sport: "Sport",
  cultura: "Cultura e spettacolo",
  politica: "Politica studentesca",
  opinioni: "Opinioni",
  pettegolezzi: "Pettegolezzi",
  interviste: "Interviste",
} as const;
export type PressSection = keyof typeof PRESS_SECTIONS;

export const PRESS_STATUS_LABEL: Record<PressStatus, string> = {
  bozza: "Bozza",
  in_revisione: "In redazione",
  pubblicato: "Pubblicato",
  rifiutato: "Da correggere",
};

export const PRESS_REACTIONS = ["❤️", "😂", "😮", "😢", "🔥", "👏"] as const;

export type PressAuthor = { id: string; name: string; avatar_url: string | null };

export type PressItem = {
  id: string;
  kind: PressKind;
  character_id: string;
  author_id: string;
  title: string;
  summary: string;
  section: PressSection;
  cover_url: string | null;
  guests: string;
  status: PressStatus;
  review_note: string;
  reviewed_by_name: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  character: PressAuthor | null;
  press_reactions: { count: number }[];
  press_comments: { count: number }[];
};

export type PressFull = PressItem & {
  body: string;
  reactions: { character_id: string; emoji: string }[];
};

export type PressComment = {
  id: number;
  character_id: string;
  author_id: string;
  body: string;
  created_at: string;
  character: PressAuthor | null;
};

// articoli e personaggi sono collegati anche tramite le reazioni: va detto quale collegamento usare
const AUTHOR = "character:characters!press_items_character_id_fkey(id, name, avatar_url)";
const COMMENT_AUTHOR = "character:characters!press_comments_character_id_fkey(id, name, avatar_url)";
export const PRESS_LIST_SELECT = `id, kind, character_id, author_id, title, summary, section, cover_url, guests, status, review_note, reviewed_by_name, published_at, created_at, updated_at, ${AUTHOR}, press_reactions(count), press_comments(count)`;
export const PRESS_FULL_SELECT = `id, kind, character_id, author_id, title, summary, body, section, cover_url, guests, status, review_note, reviewed_by_name, published_at, created_at, updated_at, ${AUTHOR}, press_reactions(count), press_comments(count), reactions:press_reactions(character_id, emoji)`;
export const PRESS_COMMENT_SELECT = `id, character_id, author_id, body, created_at, ${COMMENT_AUTHOR}`;

/** "12 nov 2026" in ora italiana */
export function pressDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });
}
