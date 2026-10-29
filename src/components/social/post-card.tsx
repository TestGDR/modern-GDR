"use client";

import { useState } from "react";
import { MapPin, MessageCircle, MoreHorizontal, SendHorizontal, SmilePlus, Trash2 } from "lucide-react";
import { Avatar, Caption, Carousel, PersonName, useSocial } from "@/components/social/social-ui";
import { PERSON, REACTIONS, socialTime, type Reaction, type SocialComment, type SocialPost } from "@/lib/social";
import { cn } from "@/lib/utils";

/** Un post: autore, carosello, reazioni, testo, tag e commenti */
export function PostCard({ post, onChanged, onDeleted }: { post: SocialPost; onChanged: () => void; onDeleted?: () => void }) {
  const { supabase, me, canModerate, go } = useSocial();
  const [reactions, setReactions] = useState(post.social_reactions);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [comments, setComments] = useState<SocialComment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.social_comments[0]?.count ?? 0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mine = reactions.find((r) => r.character_id === me?.id)?.emoji ?? null;
  const isMine = me?.id === post.character_id;
  const tags = post.social_tags.map((t) => t.character).filter((c) => c !== null);

  // conteggio per emoji, dalla più usata
  const counts = REACTIONS.map((e) => ({ e, n: reactions.filter((r) => r.emoji === e).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  async function react(emoji: Reaction | null) {
    if (!me) return;
    setPicker(false);
    setError(null);
    const before = reactions;
    const next = reactions.filter((r) => r.character_id !== me.id);
    if (emoji) next.push({ character_id: me.id, emoji });
    setReactions(next);
    const { error: e } = !emoji
      ? await supabase.from("social_reactions").delete().eq("post_id", post.id).eq("character_id", me.id)
      : mine
        ? await supabase.from("social_reactions").update({ emoji }).eq("post_id", post.id).eq("character_id", me.id)
        : await supabase.from("social_reactions").insert({ post_id: post.id, character_id: me.id, emoji });
    if (e) {
      setReactions(before);
      setError("Reazione non salvata.");
    }
  }

  async function loadComments() {
    const { data } = await supabase
      .from("social_comments")
      .select(`id, body, created_at, character_id, author:characters(${PERSON})`)
      .eq("post_id", post.id)
      .order("created_at")
      .limit(200)
      .overrideTypes<SocialComment[], { merge: false }>();
    setComments(data ?? []);
    setCommentCount(data?.length ?? 0);
  }

  async function comment() {
    const body = text.trim();
    if (!me || !body) return;
    const { error: e } = await supabase.from("social_comments").insert({ post_id: post.id, character_id: me.id, body: body.slice(0, 1000) });
    if (e) return setError("Commento non pubblicato.");
    setText("");
    await loadComments();
  }

  async function removeComment(id: number) {
    if (!window.confirm("Eliminare il commento?")) return;
    await supabase.from("social_comments").delete().eq("id", id);
    await loadComments();
  }

  async function removePost() {
    setMenu(false);
    if (!window.confirm("Eliminare il post? Non si torna indietro.")) return;
    const { error: e } = await supabase.from("social_posts").delete().eq("id", post.id);
    if (e) return setError("Post non eliminato.");
    onDeleted?.();
    onChanged();
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-night/40">
      {/* autore */}
      <header className="flex items-center gap-3 px-3 py-2.5">
        <button type="button" onClick={() => post.author && go({ kind: "profile", id: post.author.id })}>
          <Avatar person={post.author} ring />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <PersonName person={post.author} className="text-sm" />
          {post.location && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3" /> {post.location}
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{socialTime(post.created_at)}</span>
        {(isMine || canModerate) && (
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} className="grid size-8 place-items-center rounded-full hover:bg-white/10" aria-label="Altro">
              <MoreHorizontal className="size-5" />
            </button>
            {menu && (
              <div className="absolute top-9 right-0 z-10 w-44 overflow-hidden rounded-xl border border-white/15 bg-night/95 shadow-xl">
                <button type="button" onClick={removePost} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-white/10">
                  <Trash2 className="size-4" /> Elimina il post
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <Carousel media={post.media} />

      {/* reazioni e commenti */}
      <div className="flex items-center gap-1 px-2 pt-2">
        <button
          type="button"
          disabled={!me}
          onClick={() => react(mine ? null : "❤️")}
          className={cn("grid size-9 place-items-center rounded-full text-xl transition-transform hover:bg-white/10 active:scale-90 disabled:opacity-40", !mine && "grayscale")}
          aria-label={mine ? "Togli la reazione" : "Mi piace"}
          title={mine ? "Togli la reazione" : "Mi piace"}
        >
          {mine ?? "🤍"}
        </button>
        <div className="relative">
          <button type="button" disabled={!me} onClick={() => setPicker((v) => !v)} className="grid size-9 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40" aria-label="Scegli una reazione" title="Reazioni">
            <SmilePlus className="size-5" />
          </button>
          {picker && (
            <div className="absolute bottom-11 left-0 z-10 flex gap-1 rounded-full border border-white/15 bg-night/95 px-2 py-1 shadow-xl">
              {REACTIONS.map((e) => (
                <button key={e} type="button" onClick={() => react(e)} className={cn("grid size-9 place-items-center rounded-full text-xl transition-transform hover:scale-125", mine === e && "bg-white/15")}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => (comments ? setComments(null) : loadComments())} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Commenti">
          <MessageCircle className="size-5" />
        </button>
        {me && !isMine && post.author && (
          <button type="button" onClick={() => go({ kind: "dm", id: post.author!.id })} className="grid size-9 place-items-center rounded-full hover:bg-white/10" aria-label="Scrivi in DM all'autore" title="Scrivi in DM">
            <SendHorizontal className="size-5" />
          </button>
        )}
        {counts.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5 pr-2 text-xs text-muted-foreground">
            <span>{counts.slice(0, 3).map((c) => c.e).join("")}</span>
            {reactions.length}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 px-3 pt-1 pb-3 text-sm">
        {post.body && (
          <p>
            <PersonName person={post.author} className="mr-1.5" />
            <Caption text={post.body} />
          </p>
        )}
        {tags.length > 0 && (
          <p className="text-xs text-muted-foreground">
            con{" "}
            {tags.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ", "}
                <PersonName person={t} className="font-medium text-lavender" />
              </span>
            ))}
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!comments && commentCount > 0 && (
          <button type="button" onClick={loadComments} className="w-fit text-xs text-muted-foreground hover:text-foreground">
            Mostra {commentCount === 1 ? "il commento" : `tutti i ${commentCount} commenti`}
          </button>
        )}
        {comments && (
          <ul className="mt-1 flex flex-col gap-1.5">
            {comments.map((c) => (
              <li key={c.id} className="group flex items-start gap-2">
                <Avatar person={c.author} size="size-6" />
                <p className="min-w-0 flex-1 text-sm">
                  <PersonName person={c.author} className="mr-1.5" />
                  <Caption text={c.body} />
                  <span className="ml-2 text-[0.7rem] text-muted-foreground">{socialTime(c.created_at)}</span>
                </p>
                {(c.character_id === me?.id || isMine || canModerate) && (
                  <button type="button" onClick={() => removeComment(c.id)} className="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100" aria-label="Elimina il commento">
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </li>
            ))}
            {comments.length === 0 && <li className="text-xs text-muted-foreground">Ancora nessun commento.</li>}
          </ul>
        )}
        {me && comments && (
          <form
            className="mt-1 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              comment();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              placeholder="Aggiungi un commento… (@nome per citare)"
              aria-label="Commento"
              className="h-9 min-w-0 flex-1 rounded-full border border-white/15 bg-night/50 px-3 text-sm outline-none focus-visible:border-peach/60"
            />
            <button type="submit" disabled={!text.trim()} className="text-sm font-semibold text-peach disabled:opacity-40">
              Pubblica
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
