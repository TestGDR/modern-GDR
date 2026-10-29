import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ONLINE_WINDOW_MS } from "@/lib/format";
import { requestTime } from "@/lib/request-time";
import { DEFAULT_CHAT_SETTINGS, HISTORY_SIZE, freshSince } from "@/lib/chat";
import type {
  Attribute,
  Character,
  CharacterSummary,
  ChatSettings,
  CreationOption,
  District,
  ForumBoard,
  ForumPost,
  ForumSection,
  ForumThread,
  GameMap,
  GameSetting,
  Message,
  News,
  Room,
  RoomGroup,
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

/* ---------------------------- Mondo: mappe e chat ---------------------------- */

export type World = {
  maps: GameMap[];
  districts: District[];
  groups: RoomGroup[];
  rooms: Room[];
};

/**
 * Mappe, quartieri, gruppi e chat. I giocatori ricevono solo quelli delle
 * mappe attive (lo decide la RLS); chi gestisce il mondo li riceve tutti.
 */
export async function getWorld(): Promise<World> {
  const supabase = await createClient();
  const [maps, districts, groups, rooms] = await Promise.all([
    supabase.from("maps").select("*").order("sort_order").order("name").overrideTypes<GameMap[], { merge: false }>(),
    supabase.from("locations").select("*").order("sort_order").order("name").overrideTypes<District[], { merge: false }>(),
    supabase.from("room_groups").select("*").order("sort_order").order("name").overrideTypes<RoomGroup[], { merge: false }>(),
    supabase.from("rooms").select("*").order("sort_order").order("name").overrideTypes<Room[], { merge: false }>(),
  ]);
  return {
    maps: maps.data ?? [],
    districts: districts.data ?? [],
    groups: groups.data ?? [],
    rooms: rooms.data ?? [],
  };
}

/** Per ogni chat, quanti personaggi sono in giocata */
export async function getRoomActivity() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("room_activity");
  const rows = (data ?? []) as { room_id: string; n: number }[];
  return new Map(rows.map((r) => [r.room_id, r.n]));
}

/** Impostazioni della chat (Gestione → Chat) */
export async function getChatSettings(): Promise<ChatSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_settings")
    .select("max_length, ttl_minutes, idle_minutes")
    .maybeSingle<ChatSettings>();
  return data ?? DEFAULT_CHAT_SETTINGS;
}

export type ChatPresent = { character_id: string; name: string; avatar_url: string | null };

/** Tutto quello che serve per aprire una chat */
export async function getChatRoom(id: string, characterId: string | null) {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data: room } = await supabase
    .from("rooms")
    .select("*, district:locations(*)")
    .eq("id", id)
    .maybeSingle<Room & { district: District }>();
  if (!room) return null;

  const [settings, now] = await Promise.all([getChatSettings(), requestTime()]);
  const since = freshSince(now.getTime(), settings.ttl_minutes);
  const [canEnter, present, hidden, messages, guests, busy, invisible] = await Promise.all([
    supabase.rpc("can_enter_room", { r: id }),
    supabase.rpc("chat_present", { p_room: id }),
    supabase.rpc("chat_hidden_count", { p_room: id }),
    // Li legge solo chi è in giocata (lo decide la RLS)
    supabase
      .from("messages")
      .select("*")
      .eq("room_id", id)
      .gt("created_at", since)
      .order("created_at", { ascending: false })
      .limit(HISTORY_SIZE)
      .overrideTypes<Message[], { merge: false }>(),
    room.access === "su_invito"
      ? supabase
          .from("room_guests")
          .select("character:characters(id, name)")
          .eq("room_id", id)
          .order("created_at")
          .overrideTypes<{ character: { id: string; name: string } | null }[], { merge: false }>()
      : Promise.resolve({ data: [] as { character: { id: string; name: string } | null }[] }),
    // Giocata in corso in un'altra chat: prima va chiusa quella
    characterId
      ? supabase
          .from("chat_presence")
          .select("room_id, room:rooms(name)")
          .eq("character_id", characterId)
          .neq("room_id", id)
          .gt("last_active_at", new Date(now.getTime() - settings.idle_minutes * 60_000).toISOString())
          .limit(1)
          .maybeSingle<{ room_id: string; room: { name: string } | null }>()
      : Promise.resolve({ data: null }),
    supabase.rpc("i_am_invisible"),
  ]);

  const visible = (messages.data ?? [])
    .filter((m) => !room.cleared_at || m.created_at > room.cleared_at)
    .reverse();

  return {
    room,
    settings,
    canEnter: canEnter.data === true,
    present: (present.data ?? []) as ChatPresent[],
    hiddenCount: (hidden.data as number | null) ?? 0,
    messages: visible,
    snapshotAt: now.toISOString(),
    guests: (guests.data ?? []).flatMap((g) => (g.character ? [g.character] : [])),
    busyIn: busy.data ? { id: busy.data.room_id, name: busy.data.room?.name ?? "un'altra chat" } : null,
    invisible: invisible.data === true,
  };
}

export type ChatRoomData = NonNullable<Awaited<ReturnType<typeof getChatRoom>>>;

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
    .select("*, district:locations(name, gradient)")
    .eq("id", id)
    .maybeSingle<Character & { district: Pick<District, "name" | "gradient"> | null }>();
  return data;
}

export async function getDistricts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("*")
    .order("sort_order")
    .order("name")
    .overrideTypes<District[], { merge: false }>();
  return data ?? [];
}

/* ------------------------------ Notizie ------------------------------ */

export async function getNews(limit = 5) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("news")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
    .overrideTypes<News[], { merge: false }>();
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

/** Discussioni con messaggi nuovi per l'utente collegato */
export async function getForumUnread() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("forum_unread");
  return (data ?? []) as { thread_id: string; board_id: string }[];
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
    .order("is_important", { ascending: false })
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

/** Lavori e gruppi di un personaggio, per la scheda */
export type CharacterAffiliations = {
  jobs: { name: string; role: string; kind: "full_time" | "part_time" }[];
  groups: { name: string; role: string }[];
  /** Account del giocatore: iscrizione e ultimo accesso (date ISO) */
  joinedAt: string | null;
  lastLoginAt: string | null;
};

export async function getCharacterAffiliations(characterId: string): Promise<CharacterAffiliations> {
  const supabase = await createClient();
  const { data: owner } = await supabase.from("characters").select("owner_id").eq("id", characterId).maybeSingle<{ owner_id: string }>();
  const [jobs, groups, profile] = await Promise.all([
    supabase
      .from("character_jobs")
      .select("job:jobs(name, kind, active), role:job_roles(name)")
      .eq("character_id", characterId)
      .overrideTypes<{ job: { name: string; kind: "full_time" | "part_time"; active: boolean } | null; role: { name: string } | null }[], { merge: false }>(),
    supabase
      .from("character_groups")
      .select("grp:game_groups(name, active), role:group_roles(name)")
      .eq("character_id", characterId)
      .overrideTypes<{ grp: { name: string; active: boolean } | null; role: { name: string } | null }[], { merge: false }>(),
    owner
      ? supabase.from("profiles").select("created_at, last_login_at").eq("id", owner.owner_id).maybeSingle<{ created_at: string; last_login_at: string | null }>()
      : Promise.resolve({ data: null }),
  ]);
  return {
    jobs: (jobs.data ?? []).filter((j) => j.job?.active).map((j) => ({ name: j.job!.name, role: j.role?.name ?? "", kind: j.job!.kind })),
    groups: (groups.data ?? []).filter((g) => g.grp?.active).map((g) => ({ name: g.grp!.name, role: g.role?.name ?? "" })),
    joinedAt: profile.data?.created_at ?? null,
    lastLoginAt: profile.data?.last_login_at ?? null,
  };
}

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
