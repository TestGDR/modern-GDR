import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ONLINE_WINDOW_MS } from "@/lib/format";
import { requestTime } from "@/lib/request-time";
import type {
  Attribute,
  Character,
  CharacterSummary,
  ChatMessage,
  CityNews,
  CreationOption,
  District,
  DistrictWithPlaces,
  ForumBoard,
  ForumPost,
  ForumSection,
  ForumThread,
  GameSetting,
  Place,
  PrivateMessage,
  SheetOption,
  Skill,
  SocialComment,
  SocialPost,
} from "@/lib/types";

// Tutte le letture passano dal client Supabase dell'utente collegato:
// la RLS del database decide cosa può vedere.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string) {
  return UUID_RE.test(value);
}

/* ---------------------------- Mappa e luoghi ---------------------------- */

export async function getDistrictsWithPlaces() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("districts")
    .select("*, places(*)")
    .order("sort_order")
    .order("sort_order", { referencedTable: "places" })
    .overrideTypes<DistrictWithPlaces[], { merge: false }>();
  return data ?? [];
}

export async function getPlaceBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("*, district:districts(*)")
    .eq("slug", slug)
    .maybeSingle<Place & { district: District }>();
  return data;
}

/** Per ogni luogo, quanti personaggi hanno scritto negli ultimi 30 minuti */
export async function getPlaceActivity() {
  const supabase = await createClient();
  const since = new Date((await requestTime()).getTime() - 30 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("chat_messages")
    .select("place_id, character_id")
    .gte("created_at", since)
    .overrideTypes<Pick<ChatMessage, "place_id" | "character_id">[], { merge: false }>();

  const byPlace = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    if (!byPlace.has(row.place_id)) byPlace.set(row.place_id, new Set());
    byPlace.get(row.place_id)!.add(row.character_id);
  }
  return new Map([...byPlace].map(([placeId, chars]) => [placeId, chars.size]));
}

/* ------------------------------- Chat ------------------------------- */

export type ChatMessageWithCharacter = ChatMessage & { character: { id: string; name: string } | null };

export async function getChatMessages(placeId: string, limit = 60) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("*, character:characters(id, name)")
    .eq("place_id", placeId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .overrideTypes<ChatMessageWithCharacter[], { merge: false }>();
  return (data ?? []).reverse();
}

/* ---------------------------- Personaggi ---------------------------- */

export async function getOnlineCharacters() {
  const supabase = await createClient();
  const since = new Date((await requestTime()).getTime() - ONLINE_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from("characters")
    .select("id, name, occupation, last_seen_at")
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(30)
    .overrideTypes<CharacterSummary[], { merge: false }>();
  return data ?? [];
}

export async function getAllCharacters() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("characters")
    .select("id, name, occupation, last_seen_at")
    .order("name")
    .overrideTypes<CharacterSummary[], { merge: false }>();
  return data ?? [];
}

export async function getCharacter(id: string) {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("characters")
    .select("*, district:districts(name, slug, gradient)")
    .eq("id", id)
    .maybeSingle<Character & { district: Pick<District, "name" | "slug" | "gradient"> | null }>();
  return data;
}

export async function getDistricts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("districts")
    .select("*")
    .order("sort_order")
    .overrideTypes<District[], { merge: false }>();
  return data ?? [];
}

/* ------------------------------ Notizie ------------------------------ */

export async function getNews(limit = 5) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("city_news")
    .select("id, title, body, district_id, published_at")
    .order("published_at", { ascending: false })
    .limit(limit)
    .overrideTypes<CityNews[], { merge: false }>();
  return data ?? [];
}

/* -------------------------- Messaggi privati -------------------------- */

export type ConversationSummary = {
  other: CharacterSummary;
  last: PrivateMessage;
  unread: number;
};

/** Le conversazioni del mio personaggio, dalla più recente */
export async function getConversations(myCharacterId: string) {
  const supabase = await createClient();
  // La RLS restituisce solo i messaggi di cui sono mittente o destinatario
  const { data: messages } = await supabase
    .from("private_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)
    .overrideTypes<PrivateMessage[], { merge: false }>();

  const byOther = new Map<string, { last: PrivateMessage; unread: number }>();
  for (const m of messages ?? []) {
    const otherId = m.sender_id === myCharacterId ? m.recipient_id : m.sender_id;
    const entry = byOther.get(otherId) ?? { last: m, unread: 0 };
    if (m.recipient_id === myCharacterId && !m.read_at) entry.unread++;
    byOther.set(otherId, entry);
  }
  if (byOther.size === 0) return [];

  const { data: others } = await supabase
    .from("characters")
    .select("id, name, occupation, last_seen_at")
    .in("id", [...byOther.keys()])
    .overrideTypes<CharacterSummary[], { merge: false }>();
  const othersById = new Map((others ?? []).map((c) => [c.id, c]));

  const result: ConversationSummary[] = [];
  for (const [otherId, entry] of byOther) {
    const other = othersById.get(otherId);
    if (other) result.push({ other, ...entry });
  }
  return result;
}

export async function getMessagesWith(myCharacterId: string, otherId: string) {
  if (!isUuid(otherId)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("private_messages")
    .select("*")
    .or(
      `and(sender_id.eq.${myCharacterId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${myCharacterId})`,
    )
    .order("created_at", { ascending: true })
    .limit(300)
    .overrideTypes<PrivateMessage[], { merge: false }>();
  return data ?? [];
}

/* ------------------------------- Forum ------------------------------- */

export async function getForumSections() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_sections")
    .select("*, forum_boards(*)")
    .order("sort_order")
    .order("sort_order", { referencedTable: "forum_boards" })
    .overrideTypes<ForumSection[], { merge: false }>();
  return data ?? [];
}

/** Numero di discussioni e ultima attività per bacheca */
export async function getBoardStats() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_threads")
    .select("board_id, updated_at")
    .overrideTypes<Pick<ForumThread, "board_id" | "updated_at">[], { merge: false }>();
  const stats = new Map<string, { threads: number; lastActivity: string }>();
  for (const t of data ?? []) {
    const s = stats.get(t.board_id) ?? { threads: 0, lastActivity: t.updated_at };
    s.threads++;
    if (t.updated_at > s.lastActivity) s.lastActivity = t.updated_at;
    stats.set(t.board_id, s);
  }
  return stats;
}

export async function getBoard(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_boards")
    .select("*, section:forum_sections(title, is_on_game)")
    .eq("slug", slug)
    .maybeSingle<ForumBoard & { section: { title: string; is_on_game: boolean } }>();
  return data;
}

export type ThreadListItem = ForumThread & {
  author: { username: string } | null;
  character: { name: string } | null;
  forum_posts: { count: number }[];
};

export async function getThreads(boardId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_threads")
    .select("*, author:profiles(username), character:characters(name), forum_posts(count)")
    .eq("board_id", boardId)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(100)
    .overrideTypes<ThreadListItem[], { merge: false }>();
  return data ?? [];
}

export async function getThread(id: string) {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_threads")
    .select("*, board:forum_boards(slug, name)")
    .eq("id", id)
    .maybeSingle<ForumThread & { board: { slug: string; name: string } }>();
  return data;
}

export type PostWithAuthor = ForumPost & {
  author: { username: string; level: { name: string; color: string | null } | null } | null;
  character: { id: string; name: string } | null;
};

export async function getPosts(threadId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("forum_posts")
    .select("*, author:profiles(username, level:user_levels(name, color)), character:characters(id, name)")
    .eq("thread_id", threadId)
    .order("created_at")
    .limit(500)
    .overrideTypes<PostWithAuthor[], { merge: false }>();
  return data ?? [];
}

/* ------------------------------- Social ------------------------------- */

export type FeedPost = SocialPost & {
  character: { id: string; name: string } | null;
  social_likes: { character_id: string }[];
  social_comments: (SocialComment & { character: { id: string; name: string } | null })[];
};

export async function getFeed(limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("social_posts")
    .select(
      "*, character:characters(id, name), social_likes(character_id), social_comments(*, character:characters(id, name))",
    )
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "social_comments", ascending: true })
    .limit(limit)
    .overrideTypes<FeedPost[], { merge: false }>();
  return data ?? [];
}

/* --------------------------- Sistema Interlock --------------------------- */

export type RulesData = {
  attributes: Attribute[];
  skills: Skill[];
  options: CreationOption[];
  sheetOptions: SheetOption[];
  settings: GameSetting[];
};

/** Caratteristiche, abilità, scelte, elenchi e impostazioni (solo voci attive) */
export async function getRulesData(): Promise<RulesData> {
  const supabase = await createClient();
  const [attributes, skills, options, sheetOptions, settings] = await Promise.all([
    supabase.from("attributes").select("*").eq("active", true).order("sort_order").overrideTypes<Attribute[], { merge: false }>(),
    supabase.from("skills").select("*").eq("active", true).order("sort_order").overrideTypes<Skill[], { merge: false }>(),
    supabase.from("creation_options").select("*").eq("active", true).order("sort_order").overrideTypes<CreationOption[], { merge: false }>(),
    supabase.from("sheet_options").select("*").eq("active", true).order("sort_order").overrideTypes<SheetOption[], { merge: false }>(),
    supabase.from("game_settings").select("*").order("sort_order").overrideTypes<GameSetting[], { merge: false }>(),
  ]);
  return {
    attributes: attributes.data ?? [],
    skills: skills.data ?? [],
    options: options.data ?? [],
    sheetOptions: sheetOptions.data ?? [],
    settings: settings.data ?? [],
  };
}

export type CharacterBuild = {
  attributes: Record<string, number>;
  skills: Record<string, number>;
  optionIds: string[];
};

/** Valori di un personaggio: caratteristiche, abilità e scelte di creazione */
export async function getCharacterBuild(characterId: string): Promise<CharacterBuild> {
  const supabase = await createClient();
  const [attrs, skills, options] = await Promise.all([
    supabase.from("character_attributes").select("attribute_id, value").eq("character_id", characterId)
      .overrideTypes<{ attribute_id: string; value: number }[], { merge: false }>(),
    supabase.from("character_skills").select("skill_id, level").eq("character_id", characterId)
      .overrideTypes<{ skill_id: string; level: number }[], { merge: false }>(),
    supabase.from("character_options").select("option_id").eq("character_id", characterId)
      .overrideTypes<{ option_id: string }[], { merge: false }>(),
  ]);
  return {
    attributes: Object.fromEntries((attrs.data ?? []).map((r) => [r.attribute_id, r.value])),
    skills: Object.fromEntries((skills.data ?? []).map((r) => [r.skill_id, r.level])),
    optionIds: (options.data ?? []).map((r) => r.option_id),
  };
}

/** Schede in attesa di approvazione (visibili a chi ha il permesso di vederle) */
export async function getPendingCharacters() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("characters")
    .select("id, name, updated_at")
    .eq("status", "in_attesa")
    .order("updated_at")
    .overrideTypes<{ id: string; name: string; updated_at: string }[], { merge: false }>();
  return data ?? [];
}
