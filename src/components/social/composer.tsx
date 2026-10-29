"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, MapPin, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, MediaItem, useSocial } from "@/components/social/social-ui";
import { detectMedia, handleOf, PERSON, type Media, type SocialPerson } from "@/lib/social";

/** Cerca personaggi approvati per nome o @nome */
export function usePersonSearch(query: string) {
  const { supabase } = useSocial();
  const [results, setResults] = useState<SocialPerson[]>([]);
  const term = query.trim().replace(/^@/, "").replace(/[%_,()]/g, "");
  useEffect(() => {
    if (term.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      const [{ data: byName }, { data: byHandle }] = await Promise.all([
        supabase.from("characters").select(PERSON).eq("status", "approvata").ilike("name", `%${term}%`).limit(10).overrideTypes<SocialPerson[], { merge: false }>(),
        supabase
          .from("social_profiles")
          .select(`character:characters(${PERSON})`)
          .ilike("handle", `%${term.toLowerCase()}%`)
          .limit(10)
          .overrideTypes<{ character: SocialPerson | null }[], { merge: false }>(),
      ]);
      const all = [...(byHandle ?? []).map((x) => x.character), ...(byName ?? [])].filter((p): p is SocialPerson => p !== null);
      if (alive) setResults(all.filter((p, i) => all.findIndex((x) => x.id === p.id) === i).slice(0, 12));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, supabase]);
  return term.length >= 2 ? results : [];
}

/** Nuovo post: link di foto/video (carosello), testo, luogo, persone taggate */
export function Composer({ onPublished }: { onPublished: (id: string) => void }) {
  const { supabase, me } = useSocial();
  const [media, setMedia] = useState<Media[]>([]);
  const [link, setLink] = useState("");
  const [body, setBody] = useState("");
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState<SocialPerson[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const found = usePersonSearch(tagQuery).filter((p) => p.id !== me?.id && !tags.some((t) => t.id === p.id));

  function addLink() {
    const m = detectMedia(link);
    if (!m) return setError("Incolla un link completo che inizi con https://");
    if (media.length >= 10) return setError("Al massimo 10 foto o video per post.");
    setMedia([...media, m]);
    setLink("");
    setError(null);
  }

  function moveMedia(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= media.length) return;
    const next = [...media];
    [next[i], next[j]] = [next[j], next[i]];
    setMedia(next);
  }

  async function publish() {
    if (!me) return;
    if (media.length === 0 && !body.trim()) return setError("Aggiungi una foto, un video o del testo.");
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("social_posts")
      .insert({ character_id: me.id, body: body.trim().slice(0, 2200), media, location: location.trim().slice(0, 60) || null })
      .select("id")
      .single<{ id: string }>();
    if (e || !data) {
      setBusy(false);
      return setError(e?.message.includes("https") ? "Un link non è valido: usa indirizzi https://" : "Post non pubblicato.");
    }
    if (tags.length) await supabase.from("social_tags").insert(tags.map((t) => ({ post_id: data.id, character_id: t.id })));
    setBusy(false);
    onPublished(data.id);
  }

  const input = "h-10 w-full min-w-0 rounded-xl border border-white/15 bg-night/50 px-3 text-sm outline-none focus-visible:border-peach/60";
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-3xl tracking-wide text-sunset">Nuovo post</h2>

      {/* media */}
      <section className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Foto e video tramite link (immagini, video .mp4 / .webm, YouTube). Con più link diventa un carosello.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addLink();
          }}
        >
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… link della foto o del video" aria-label="Link della foto o del video" className={input} />
          <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-xl">
            <ImagePlus /> Aggiungi
          </Button>
        </form>
        {media.length > 0 && (
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {media.map((m, i) => (
              <li key={`${i}-${m.url}`} className="relative size-28 shrink-0 overflow-hidden rounded-xl border border-white/15">
                <MediaItem media={m} thumb />
                <span className="absolute inset-x-0 bottom-0 flex justify-between bg-night/70 p-1">
                  <button type="button" onClick={() => moveMedia(i, -1)} disabled={i === 0} className="disabled:opacity-30" aria-label="Sposta prima">
                    <ArrowUp className="size-3.5 -rotate-90" />
                  </button>
                  <button type="button" onClick={() => setMedia(media.filter((_, k) => k !== i))} aria-label="Togli">
                    <X className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => moveMedia(i, 1)} disabled={i === media.length - 1} className="disabled:opacity-30" aria-label="Sposta dopo">
                    <ArrowDown className="size-3.5 -rotate-90" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2200}
        rows={4}
        placeholder="Scrivi una didascalia… (usa @nome per citare qualcuno)"
        aria-label="Didascalia"
        className="w-full rounded-xl border border-white/15 bg-night/50 px-3 py-2 text-sm outline-none focus-visible:border-peach/60"
      />

      <label className="flex items-center gap-2">
        <MapPin className="size-4 shrink-0 text-muted-foreground" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} placeholder="Luogo (facoltativo), es. South Beach" className={input} />
      </label>

      {/* tag */}
      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <Tag className="size-4 shrink-0 text-muted-foreground" />
          <input value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="Tagga persone: scrivi nome o @nome" className={input} />
        </label>
        {found.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {found.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setTags([...tags, p]);
                    setTagQuery("");
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pr-3 pl-1 text-xs hover:bg-white/20"
                >
                  <Avatar person={p} size="size-5" /> {handleOf(p)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <li key={t.id} className="flex items-center gap-1.5 rounded-full bg-flamingo/20 py-1 pr-2 pl-1 text-xs text-flamingo">
                <Avatar person={t} size="size-5" /> {handleOf(t)}
                <button type="button" onClick={() => setTags(tags.filter((x) => x.id !== t.id))} aria-label={`Togli ${handleOf(t)}`}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="button" onClick={publish} disabled={busy} className="h-11 rounded-full">
        {busy ? "Pubblicazione…" : "Condividi"}
      </Button>
    </div>
  );
}
