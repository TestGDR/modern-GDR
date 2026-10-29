"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Grid3x3, Layers, MessageCircle, Pencil, SendHorizontal, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePersonSearch } from "@/components/social/composer";
import { PostCard } from "@/components/social/post-card";
import { Avatar, Caption, MediaItem, PersonName, useSocial } from "@/components/social/social-ui";
import { useResync } from "@/lib/use-resync";
import { useStickToBottom } from "@/lib/use-stick-bottom";
import {
  HANDLE_RE,
  handleOf,
  PERSON,
  POST_SELECT,
  socialTime,
  suggestHandle,
  type SocialDm,
  type SocialNotification,
  type SocialPerson,
  type SocialPost,
} from "@/lib/social";
import { cn } from "@/lib/utils";

const PAGE = 12;

export function BackButton({ onClick, label = "Indietro" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="mb-3 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> {label}
    </button>
  );
}

/** Pulsante Segui / Segui già */
export function FollowButton({ id, className }: { id: string; className?: string }) {
  const { me, following, toggleFollow } = useSocial();
  const [busy, setBusy] = useState(false);
  if (!me || me.id === id) return null;
  const on = following.has(id);
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "outline" : "default"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await toggleFollow(id);
        setBusy(false);
      }}
      className={cn("rounded-full", className)}
    >
      {on ? "Segui già" : "Segui"}
    </Button>
  );
}

/* ------------------------------ Feed ------------------------------ */

export function Feed() {
  const { supabase, me, following } = useSocial();
  const [mode, setMode] = useState<"tutti" | "seguiti">("tutti");
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (from = 0) => {
      let q = supabase.from("social_posts").select(POST_SELECT).order("created_at", { ascending: false });
      if (mode === "seguiti") q = q.in("character_id", [...following, ...(me ? [me.id] : [])]);
      const { data } = await q.range(from, from + PAGE).overrideTypes<SocialPost[], { merge: false }>();
      const rows = data ?? [];
      setMore(rows.length > PAGE);
      setPosts((prev) => (from === 0 ? rows.slice(0, PAGE) : [...(prev ?? []), ...rows.slice(0, PAGE)]));
    },
    [supabase, mode, following, me],
  );

  useEffect(() => {
    const t = setTimeout(() => load(0), 0);
    return () => clearTimeout(t);
  }, [load]);
  useResync(() => load(0));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(["tutti", "seguiti"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn("rounded-full px-4 py-1.5 text-sm", mode === m ? "bg-white/15 font-semibold text-white" : "text-muted-foreground hover:bg-white/5")}
          >
            {m === "tutti" ? "Per te" : "Seguiti"}
          </button>
        ))}
      </div>
      {posts === null ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {mode === "seguiti" ? "Nessun post da chi segui. Cerca qualcuno da seguire!" : "Ancora nessun post. Pubblica tu il primo!"}
        </p>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} onChanged={() => load(0)} />)
      )}
      {more && (
        <Button type="button" variant="outline" className="rounded-full" onClick={() => load(posts?.length ?? 0)}>
          Carica altri post
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ Post singolo ------------------------------ */

export function PostView({ id, onBack }: { id: string; onBack: () => void }) {
  const { supabase } = useSocial();
  const [post, setPost] = useState<SocialPost | null | undefined>(undefined);
  const load = useCallback(async () => {
    const { data } = await supabase.from("social_posts").select(POST_SELECT).eq("id", id).maybeSingle<SocialPost>();
    setPost(data);
  }, [supabase, id]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  return (
    <div>
      <BackButton onClick={onBack} />
      {post === undefined ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : post === null ? (
        <p className="text-sm text-muted-foreground">Il post non c&apos;è più.</p>
      ) : (
        <PostCard post={post} onChanged={load} onDeleted={onBack} />
      )}
    </div>
  );
}

/* ------------------------------ Profilo ------------------------------ */

export function ProfileView({ id }: { id: string }) {
  const { supabase, me, go, following } = useSocial();
  const [person, setPerson] = useState<SocialPerson | null | undefined>(undefined);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
  const [tab, setTab] = useState<"post" | "tag">("post");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const [p, list, fr, fg, pc] = await Promise.all([
      supabase.from("characters").select(PERSON).eq("id", id).maybeSingle<SocialPerson>(),
      tab === "post"
        ? supabase.from("social_posts").select(POST_SELECT).eq("character_id", id).order("created_at", { ascending: false }).limit(60)
        : supabase.from("social_tags").select(`post:social_posts(${POST_SELECT})`).eq("character_id", id).limit(60),
      supabase.from("social_follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", id),
      supabase.from("social_follows").select("followed_id", { count: "exact", head: true }).eq("follower_id", id),
      supabase.from("social_posts").select("id", { count: "exact", head: true }).eq("character_id", id),
    ]);
    setPerson(p.data);
    const rows = tab === "post" ? ((list.data ?? []) as unknown as SocialPost[]) : ((list.data ?? []) as unknown as { post: SocialPost | null }[]).map((x) => x.post).filter((x): x is SocialPost => x !== null);
    setPosts(rows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setStats({ posts: pc.count ?? 0, followers: fr.count ?? 0, following: fg.count ?? 0 });
  }, [supabase, id, tab]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load, following]);

  if (person === undefined) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (person === null) return <p className="text-sm text-muted-foreground">Profilo non trovato.</p>;
  const isMe = me?.id === person.id;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 @lg:gap-8">
        <Avatar person={person} size="size-20 @lg:size-28" ring />
        <div className="grid flex-1 grid-cols-3 text-center">
          <span>
            <b className="block text-lg">{stats.posts}</b>
            <span className="text-xs text-muted-foreground">post</span>
          </span>
          <button type="button" onClick={() => go({ kind: "follows", id: person.id, which: "followers" })} className="hover:opacity-80">
            <b className="block text-lg">{stats.followers}</b>
            <span className="text-xs text-muted-foreground">follower</span>
          </button>
          <button type="button" onClick={() => go({ kind: "follows", id: person.id, which: "following" })} className="hover:opacity-80">
            <b className="block text-lg">{stats.following}</b>
            <span className="text-xs text-muted-foreground">seguiti</span>
          </button>
        </div>
      </div>
      <div>
        <p className="font-semibold">{handleOf(person)}</p>
        <Link href={`/scheda/${person.id}`} className="text-sm text-peach hover:underline">
          {person.name}
        </Link>
        {person.social?.bio && (
          <p className="mt-1 text-sm">
            <Caption text={person.social.bio} />
          </p>
        )}
      </div>
      {editing && isMe ? (
        <ProfileEditor onDone={() => setEditing(false)} />
      ) : (
        <div className="flex gap-2">
          {isMe ? (
            <Button type="button" variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => setEditing(true)}>
              <Pencil /> Modifica profilo
            </Button>
          ) : (
            <>
              <FollowButton id={person.id} className="flex-1" />
              {me && (
                <Button type="button" variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => go({ kind: "dm", id: person.id })}>
                  <MessageCircle /> Messaggio
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex border-t border-white/10">
        {(
          [
            ["post", "Post", Grid3x3],
            ["tag", "Taggato", UserRoundPlus],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("flex flex-1 items-center justify-center gap-1.5 border-t-2 py-2 text-xs tracking-wider uppercase", tab === k ? "border-white text-white" : "border-transparent text-muted-foreground")}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      {posts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{tab === "post" ? "Nessun post." : "Nessun post in cui è taggato."}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-0.5">
          {posts.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => go({ kind: "post", id: p.id })} className="relative block aspect-square w-full overflow-hidden bg-white/5" aria-label="Apri il post">
                {p.media[0] ? (
                  <MediaItem media={p.media[0]} thumb />
                ) : (
                  <span className="line-clamp-5 p-2 text-left text-[0.7rem] text-muted-foreground">{p.body}</span>
                )}
                {p.media.length > 1 && <Layers className="absolute top-1.5 right-1.5 size-4 text-white drop-shadow" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Crea o modifica il proprio profilo (@nome e bio) */
export function ProfileEditor({ onDone, first }: { onDone: () => void; first?: boolean }) {
  const { supabase, me } = useSocial();
  const [handle, setHandle] = useState(me?.handle ?? suggestHandle(me?.name ?? ""));
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!me || first || loaded.current) return;
    loaded.current = true;
    supabase
      .from("social_profiles")
      .select("bio")
      .eq("character_id", me.id)
      .maybeSingle<{ bio: string }>()
      .then(({ data }) => setBio(data?.bio ?? ""));
  }, [supabase, me, first]);

  async function save() {
    if (!me) return;
    const h = handle.trim().toLowerCase().replace(/^@/, "");
    if (!HANDLE_RE.test(h)) return setError("Il @nome va da 3 a 30 caratteri: lettere minuscole, numeri, punto e trattino basso.");
    setBusy(true);
    setError(null);
    const { error: e } = first
      ? await supabase.from("social_profiles").insert({ character_id: me.id, handle: h, bio: bio.trim().slice(0, 300) })
      : await supabase.from("social_profiles").update({ handle: h, bio: bio.trim().slice(0, 300) }).eq("character_id", me.id);
    setBusy(false);
    if (e) return setError(e.code === "23505" ? "Questo @nome è già usato da un altro personaggio." : "Profilo non salvato.");
    onDone();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-night/40 p-4">
      {first && (
        <>
          <h2 className="font-heading text-3xl tracking-wide text-sunset">Benvenuto nel social</h2>
          <p className="text-sm text-muted-foreground">Scegli il @nome del tuo personaggio: è come ti vedranno gli altri. Puoi cambiarlo quando vuoi.</p>
        </>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        @nome
        <span className="flex items-center rounded-xl border border-white/15 bg-night/50 px-3 focus-within:border-peach/60">
          <span className="text-muted-foreground">@</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""))}
            maxLength={30}
            className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm text-foreground outline-none"
          />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Bio
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={300}
          rows={3}
          className="rounded-xl border border-white/15 bg-night/50 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-peach/60"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {!first && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Annulla
          </Button>
        )}
        <Button type="button" onClick={save} disabled={busy} className="rounded-full">
          {busy ? "Salvataggio…" : first ? "Inizia" : "Salva"}
        </Button>
      </div>
    </div>
  );
}

/** Elenco follower / seguiti */
export function FollowsView({ id, which }: { id: string; which: "followers" | "following" }) {
  const { supabase, go } = useSocial();
  const [people, setPeople] = useState<SocialPerson[] | null>(null);
  useEffect(() => {
    let alive = true;
    const q =
      which === "followers"
        ? supabase.from("social_follows").select(`p:characters!social_follows_follower_id_fkey(${PERSON})`).eq("followed_id", id)
        : supabase.from("social_follows").select(`p:characters!social_follows_followed_id_fkey(${PERSON})`).eq("follower_id", id);
    q.order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (alive) setPeople(((data ?? []) as unknown as { p: SocialPerson | null }[]).map((x) => x.p).filter((x): x is SocialPerson => x !== null));
      });
    return () => {
      alive = false;
    };
  }, [supabase, id, which]);
  return (
    <div>
      <BackButton onClick={() => go({ kind: "profile", id })} label="Profilo" />
      <h2 className="mb-3 font-heading text-2xl tracking-wide">{which === "followers" ? "Follower" : "Seguiti"}</h2>
      <PeopleList people={people} empty={which === "followers" ? "Ancora nessun follower." : "Non segue ancora nessuno."} />
    </div>
  );
}

export function PeopleList({ people, empty }: { people: SocialPerson[] | null; empty: string }) {
  const { go } = useSocial();
  if (people === null) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (people.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col">
      {people.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-2">
          <button type="button" onClick={() => go({ kind: "profile", id: p.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Avatar person={p} size="size-11" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{handleOf(p)}</span>
              <span className="block truncate text-xs text-muted-foreground">{p.name}</span>
            </span>
          </button>
          <FollowButton id={p.id} />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ Cerca ------------------------------ */

export function SearchView() {
  const [q, setQ] = useState("");
  const results = usePersonSearch(q);
  return (
    <div className="flex flex-col gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        placeholder="Cerca per nome o @nome…"
        aria-label="Cerca utenti"
        className="h-11 w-full rounded-xl border border-white/15 bg-night/50 px-4 text-sm outline-none focus-visible:border-peach/60"
      />
      {q.trim().length < 2 ? <p className="text-sm text-muted-foreground">Scrivi almeno 2 lettere.</p> : <PeopleList people={results} empty="Nessun personaggio trovato." />}
    </div>
  );
}

/* ------------------------------ Attività ------------------------------ */

const KIND_TEXT: Record<SocialNotification["kind"], string> = {
  follow: "ha iniziato a seguirti.",
  reaction: "ha reagito al tuo post",
  comment: "ha commentato:",
  tag: "ti ha taggato in un post.",
};

export function ActivityView({ onRead }: { onRead: () => void }) {
  const { supabase, me, go } = useSocial();
  const [items, setItems] = useState<SocialNotification[] | null>(null);
  useEffect(() => {
    if (!me) return;
    let alive = true;
    supabase
      .from("social_notifications")
      .select(`id, kind, post_id, detail, created_at, read_at, actor:characters!social_notifications_actor_id_fkey(${PERSON})`)
      .eq("character_id", me.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!alive) return;
        setItems((data ?? []) as unknown as SocialNotification[]);
        supabase.rpc("social_activity_read", { p_me: me.id }).then(() => onRead());
      });
    return () => {
      alive = false;
    };
  }, [supabase, me, onRead]);

  if (!me) return <p className="text-sm text-muted-foreground">Serve un personaggio approvato.</p>;
  return (
    <div className="flex flex-col gap-1">
      <h2 className="mb-2 font-heading text-3xl tracking-wide text-sunset">Attività</h2>
      {items === null ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ancora niente: qui vedrai chi ti segue, reagisce, commenta o ti tagga.</p>
      ) : (
        items.map((n) => (
          <div key={n.id} className={cn("flex items-center gap-3 rounded-xl px-2 py-2", !n.read_at && "bg-flamingo/10")}>
            <button type="button" onClick={() => n.actor && go({ kind: "profile", id: n.actor.id })}>
              <Avatar person={n.actor} size="size-10" />
            </button>
            <p className="min-w-0 flex-1 text-sm">
              <PersonName person={n.actor} className="mr-1" />
              {KIND_TEXT[n.kind]} {n.kind === "reaction" && n.detail}
              {n.kind === "comment" && <span className="text-muted-foreground"> {n.detail}</span>}
              <span className="ml-1.5 text-xs text-muted-foreground">{socialTime(n.created_at)}</span>
            </p>
            {n.kind === "follow" && n.actor ? (
              <FollowButton id={n.actor.id} />
            ) : (
              n.post_id && (
                <Button type="button" variant="ghost" size="sm" onClick={() => go({ kind: "post", id: n.post_id! })}>
                  Vedi
                </Button>
              )
            )}
          </div>
        ))
      )}
    </div>
  );
}

/* ------------------------------ Messaggi diretti ------------------------------ */

type InboxRow = { other_id: string; last_body: string; last_at: string; last_mine: boolean; unread: number };

export function DmList() {
  const { supabase, me, go } = useSocial();
  const [rows, setRows] = useState<(InboxRow & { person: SocialPerson | null })[] | null>(null);
  const [q, setQ] = useState("");
  const found = usePersonSearch(q).filter((p) => p.id !== me?.id);

  const load = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase.rpc("social_dm_inbox", { p_me: me.id });
    const list = ((data ?? []) as InboxRow[]).sort((a, b) => b.last_at.localeCompare(a.last_at));
    const ids = list.map((r) => r.other_id);
    const { data: people } = ids.length ? await supabase.from("characters").select(PERSON).in("id", ids) : { data: [] };
    const byId = new Map(((people ?? []) as unknown as SocialPerson[]).map((p) => [p.id, p]));
    setRows(list.map((r) => ({ ...r, person: byId.get(r.other_id) ?? null })));
  }, [supabase, me]);

  useEffect(() => {
    if (!me) return;
    const t = setTimeout(load, 0);
    const ch = supabase
      .channel(`social-dm-elenco:${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_dms" }, () => load())
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [supabase, me, load]);
  useResync(load);

  if (!me) return <p className="text-sm text-muted-foreground">Serve un personaggio approvato.</p>;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading text-3xl tracking-wide text-sunset">Messaggi</h2>
      <p className="text-xs text-muted-foreground">I messaggi diretti li leggete voi due; lo staff può consultarli solo per moderazione (Gestione → Log).</p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nuovo messaggio: cerca nome o @nome…"
        aria-label="Nuovo messaggio a"
        className="h-10 w-full rounded-xl border border-white/15 bg-night/50 px-3 text-sm outline-none focus-visible:border-peach/60"
      />
      {found.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {found.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => go({ kind: "dm", id: p.id })} className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pr-3 pl-1 text-xs hover:bg-white/20">
                <Avatar person={p} size="size-5" /> {handleOf(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna conversazione.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.other_id}>
              <button type="button" onClick={() => go({ kind: "dm", id: r.other_id })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5">
                <Avatar person={r.person} size="size-12" />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", r.unread ? "font-bold" : "font-medium")}>{handleOf(r.person)}</span>
                  <span className={cn("block truncate text-xs", r.unread ? "text-foreground" : "text-muted-foreground")}>
                    {r.last_mine ? "Tu: " : ""}
                    {r.last_body} · {socialTime(r.last_at)}
                  </span>
                </span>
                {r.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-flamingo px-1 text-[0.65rem] font-bold text-white">{r.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DmThread({ otherId, onRead }: { otherId: string; onRead: () => void }) {
  const { supabase, me, go } = useSocial();
  const [other, setOther] = useState<SocialPerson | null>(null);
  const [messages, setMessages] = useState<SocialDm[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lastId = messages[messages.length - 1]?.id;
  const { ref, onScroll } = useStickToBottom<HTMLDivElement>(`${otherId}:${lastId ?? ""}`);

  const load = useCallback(async () => {
    if (!me) return;
    const [{ data: p }, { data }] = await Promise.all([
      supabase.from("characters").select(PERSON).eq("id", otherId).maybeSingle<SocialPerson>(),
      supabase
        .from("social_dms")
        .select("id, sender_id, recipient_id, body, created_at, read_at")
        .or(`and(sender_id.eq.${me.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me.id})`)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setOther(p);
    setMessages(((data ?? []) as SocialDm[]).reverse());
  }, [supabase, me, otherId]);

  useEffect(() => {
    if (!me) return;
    const t = setTimeout(load, 0);
    const ch = supabase
      .channel(`social-dm:${me.id}:${otherId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_dms" }, (p) => {
        const m = p.new as SocialDm;
        const mine = (m.sender_id === me.id && m.recipient_id === otherId) || (m.sender_id === otherId && m.recipient_id === me.id);
        if (mine) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [supabase, me, otherId, load]);
  useResync(load);

  // letto a ogni messaggio nuovo
  useEffect(() => {
    if (!me) return;
    supabase.rpc("social_dm_read", { p_me: me.id, p_other: otherId }).then(() => onRead());
  }, [supabase, me, otherId, lastId, onRead]);

  async function send() {
    const body = text.trim();
    if (!me || !body) return;
    setError(null);
    const { data, error: e } = await supabase
      .from("social_dms")
      .insert({ sender_id: me.id, recipient_id: otherId, body: body.slice(0, 2000) })
      .select("id, sender_id, recipient_id, body, created_at, read_at")
      .single<SocialDm>();
    if (e || !data) return setError("Messaggio non inviato.");
    setText("");
    setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
  }

  if (!me) return null;
  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 pb-2">
        <button type="button" onClick={() => go({ kind: "dms" })} className="grid size-8 place-items-center rounded-full hover:bg-white/10" aria-label="Messaggi">
          <ArrowLeft className="size-5" />
        </button>
        <button type="button" onClick={() => other && go({ kind: "profile", id: other.id })} className="flex min-w-0 items-center gap-2 text-left">
          <Avatar person={other} size="size-9" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{handleOf(other)}</span>
            <span className="block truncate text-xs text-muted-foreground">{other?.name}</span>
          </span>
        </button>
      </div>
      <div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto py-3">
        <ul className="flex flex-col gap-1.5">
          {messages.map((m) => {
            const mine = m.sender_id === me.id;
            return (
              <li key={m.id} className={cn("flex max-w-[80%] flex-col", mine ? "items-end self-end" : "items-start self-start")}>
                <span className={cn("rounded-3xl px-3.5 py-2 text-sm", mine ? "bg-gradient-to-br from-violet to-orchid text-white" : "bg-white/10")}>
                  <Caption text={m.body} />
                </span>
                <span className="px-2 text-[0.65rem] text-muted-foreground">
                  {socialTime(m.created_at)}
                  {mine && m.read_at && " · Visualizzato"}
                </span>
              </li>
            );
          })}
          {messages.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Scrivi il primo messaggio.</li>}
        </ul>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <form
        className="flex items-center gap-2 border-t border-white/10 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Scrivi un messaggio…"
          aria-label="Messaggio"
          className="h-10 min-w-0 flex-1 rounded-full border border-white/15 bg-night/50 px-4 text-sm outline-none focus-visible:border-peach/60"
        />
        <Button type="submit" size="icon" disabled={!text.trim()} className="size-10 rounded-full" aria-label="Invia">
          <SendHorizontal />
        </Button>
      </form>
    </div>
  );
}
