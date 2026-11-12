"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, ImagePlus, MapPin, PenLine, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, MediaItem, useSocial } from "@/components/social/social-ui";
import { detectMedia, handleOf, PERSON, splitMentions, type Media, type SocialPerson, type SocialPost } from "@/lib/social";
import { cn } from "@/lib/utils";

type MyEvent = { id: string; title: string; starts_at: string };

type SocialClient = ReturnType<typeof useSocial>["supabase"];

/**
 * Salva i tag del post: le persone scelte più quelle scritte nel testo con @nome
 * (i tag già presenti restano, sé stessi no). Restituisce un errore se non riesce.
 */
export async function saveTags(supabase: SocialClient, postId: string, chosen: string[], body: string, meId: string | undefined) {
  const handles = [...new Set(splitMentions(body).flatMap((p) => (p.handle ? [p.handle.toLowerCase()] : [])))];
  let fromText: string[] = [];
  if (handles.length) {
    const { data } = await supabase.from("social_profiles").select("character_id, handle").in("handle", handles);
    fromText = ((data ?? []) as { character_id: string }[]).map((r) => r.character_id);
  }
  const ids = [...new Set([...chosen, ...fromText])].filter((id) => id !== meId);
  if (!ids.length) return null;
  const { error } = await supabase
    .from("social_tags")
    .upsert(ids.map((id) => ({ post_id: postId, character_id: id })), { onConflict: "post_id,character_id", ignoreDuplicates: true });
  if (error) console.error(error.message);
  return error ? "Post pubblicato, ma i tag non sono stati salvati." : null;
}

/**
 * Cerca personaggi approvati per nome o @nome (nel database, anche senza
 * punti e trattini bassi: «spacecowboy» trova @space_cowboy).
 * searched = la ricerca di questo testo è finita (per dire «nessuno trovato»).
 */
export function usePersonSearchState(query: string) {
  const { supabase } = useSocial();
  const [state, setState] = useState<{ term: string; results: SocialPerson[] }>({ term: "", results: [] });
  const term = query.trim().replace(/^@/, "").slice(0, 60);
  useEffect(() => {
    if (term.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data: ids } = await supabase.rpc("social_people_search", { p_term: term });
      const order = ((ids ?? []) as string[]).filter(Boolean);
      let people: SocialPerson[] = [];
      if (order.length) {
        const { data } = await supabase.from("characters").select(PERSON).in("id", order).overrideTypes<SocialPerson[], { merge: false }>();
        people = (data ?? []).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      }
      if (alive) setState({ term, results: people });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, supabase]);
  const ready = term.length >= 2 && state.term === term;
  return { results: ready ? state.results : [], searched: ready };
}

/** Cerca personaggi approvati per nome o @nome */
export function usePersonSearch(query: string) {
  return usePersonSearchState(query).results;
}

/** Valori del post dopo una modifica (per aggiornare subito la scheda del post) */
export type EditedPost = { body: string; location: string | null; edited_at: string | null };

/**
 * Nuovo post: link di foto/video (carosello), testo, luogo, persone taggate.
 * Con edit si modifica un post già pubblicato: tutto (foto, testo, luogo, tag, evento).
 */
export function Composer({
  onPublished,
  eventId,
  edit,
  onCancel,
  onEdited,
}: {
  onPublished: (id: string) => void;
  eventId?: string;
  edit?: SocialPost;
  onCancel?: () => void;
  onEdited?: (values: EditedPost) => void;
}) {
  const { supabase, me } = useSocial();
  const [eventChoice, setEventChoice] = useState(edit ? (edit.event_id ?? "") : (eventId ?? ""));
  const [myEvents, setMyEvents] = useState<MyEvent[]>([]);
  // eventi a cui si può collegare il post: quelli che organizzo e quelli a cui partecipo (o forse), dell'ultimo mese
  useEffect(() => {
    if (!me) return;
    let alive = true;
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    Promise.all([
      supabase.from("social_events").select("id, title, starts_at").eq("character_id", me.id).gte("starts_at", since),
      supabase.from("social_event_guests").select("event:social_events(id, title, starts_at)").eq("character_id", me.id).in("status", ["partecipo", "forse"]),
    ]).then(([own, guest]) => {
      if (!alive) return;
      const all = [
        ...((own.data ?? []) as MyEvent[]),
        ...((guest.data ?? []) as unknown as { event: MyEvent | null }[]).map((x) => x.event).filter((x): x is MyEvent => x !== null && x.starts_at >= since),
      ];
      // modificando: anche l'evento già collegato, se è più vecchio
      if (edit?.event && !all.some((x) => x.id === edit.event!.id)) all.push({ id: edit.event.id, title: edit.event.title, starts_at: "" });
      setMyEvents(all.filter((e, i) => all.findIndex((x) => x.id === e.id) === i).sort((a, b) => b.starts_at.localeCompare(a.starts_at)));
    });
    return () => {
      alive = false;
    };
  }, [supabase, me, edit]);
  // tag del post che si sta modificando (per sapere quali togliere)
  const originalTags = edit ? edit.social_tags.map((t) => t.character).filter((c): c is SocialPerson => c !== null) : [];
  // "foto" = post con foto o video; "testo" = post scritto, come su Facebook
  const [kind, setKind] = useState<"foto" | "testo">(edit && edit.media.length === 0 ? "testo" : "foto");
  const [media, setMedia] = useState<Media[]>(edit?.media ?? []);
  const [link, setLink] = useState("");
  const [body, setBody] = useState(edit?.body ?? "");
  const [location, setLocation] = useState(edit?.location ?? "");
  const [tags, setTags] = useState<SocialPerson[]>(originalTags);
  const [tagQuery, setTagQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tagSearch = usePersonSearchState(tagQuery);
  const found = tagSearch.results.filter((p) => p.id !== me?.id && !tags.some((t) => t.id === p.id));

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
    if (kind === "testo" && !body.trim()) return setError("Scrivi il testo del post.");
    if (media.length === 0 && !body.trim()) return setError("Aggiungi una foto, un video o del testo.");
    setBusy(true);
    setError(null);
    if (edit) return saveEdit();
    const { data, error: e } = await supabase
      .from("social_posts")
      .insert({ character_id: me.id, body: body.trim().slice(0, 2200), media: kind === "testo" ? [] : media, location: location.trim().slice(0, 60) || null, event_id: eventChoice || null })
      .select("id")
      .single<{ id: string }>();
    if (e || !data) {
      setBusy(false);
      return setError(e?.message.includes("https") ? "Un link non è valido: usa indirizzi https://" : "Post non pubblicato.");
    }
    // nome scritto nel campo dei tag ma non cliccato: se la persona è una sola (o il nome è esatto) si tagga lo stesso
    const q = tagQuery.trim().replace(/^@/, "").toLowerCase();
    const typed = q ? (found.find((p) => p.social?.handle?.toLowerCase() === q || p.name.toLowerCase() === q || p.name.split(" ")[0].toLowerCase() === q) ?? (found.length === 1 ? found[0] : null)) : null;
    const chosen = [...tags, ...(typed ? [typed] : [])].map((t) => t.id);
    const tagError = await saveTags(supabase, data.id, chosen, body, me.id);
    setBusy(false);
    if (tagError) window.alert(tagError);
    onPublished(data.id);
  }

  // modifica di un post già pubblicato
  async function saveEdit() {
    if (!me || !edit) return;
    const row = {
      body: body.trim().slice(0, 2200),
      media: kind === "testo" ? [] : media,
      location: location.trim().slice(0, 60) || null,
      event_id: eventChoice || null,
    };
    const { data, error: e } = await supabase.from("social_posts").update(row).eq("id", edit.id).select("body, location, edited_at").maybeSingle<EditedPost>();
    if (e || !data) {
      setBusy(false);
      return setError(e?.message.includes("https") ? "Un link non è valido: usa indirizzi https://" : "Modifica non salvata.");
    }
    // tag: via quelli tolti, poi quelli scelti e i @nome del testo
    const q = tagQuery.trim().replace(/^@/, "").toLowerCase();
    const typed = q ? (found.find((p) => p.social?.handle?.toLowerCase() === q || p.name.toLowerCase() === q || p.name.split(" ")[0].toLowerCase() === q) ?? (found.length === 1 ? found[0] : null)) : null;
    const chosen = [...tags, ...(typed ? [typed] : [])].map((t) => t.id);
    const removed = originalTags.map((t) => t.id).filter((id) => !chosen.includes(id));
    if (removed.length) await supabase.from("social_tags").delete().eq("post_id", edit.id).in("character_id", removed);
    const tagError = await saveTags(supabase, edit.id, chosen, row.body, me.id);
    setBusy(false);
    if (tagError) window.alert(tagError.replace("Post pubblicato", "Post modificato"));
    onEdited?.(data);
    onPublished(edit.id);
  }

  const input = "h-10 w-full min-w-0 rounded-xl border border-white/15 bg-night/50 px-3 text-sm outline-none focus-visible:border-peach/60";
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-3xl tracking-wide text-sunset">{edit ? "Modifica il post" : "Nuovo post"}</h2>

      <div className="flex gap-2">
        {(
          [
            ["foto", "Foto o video", ImagePlus],
            ["testo", "Post scritto", PenLine],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
              kind === k ? "border-peach/60 bg-white/15 font-semibold text-white" : "border-white/15 text-muted-foreground hover:bg-white/5",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {/* media */}
      {kind === "foto" && (
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
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2200}
        rows={kind === "testo" ? 8 : 4}
        placeholder={kind === "testo" ? "A cosa stai pensando? (usa @nome per citare qualcuno)" : "Scrivi una didascalia… (usa @nome per citare qualcuno)"}
        aria-label={kind === "testo" ? "Testo del post" : "Didascalia"}
        className={cn(
          "w-full rounded-xl border border-white/15 bg-night/50 px-3 py-2 outline-none focus-visible:border-peach/60",
          kind === "testo" ? "text-base leading-relaxed" : "text-sm",
        )}
      />
      {kind === "testo" && <p className="-mt-2 text-right text-xs text-muted-foreground">{body.length} / 2200</p>}

      <label className="flex items-center gap-2">
        <MapPin className="size-4 shrink-0 text-muted-foreground" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} placeholder="Luogo (facoltativo), es. South Beach" className={input} />
      </label>

      {myEvents.length > 0 && (
        <label className="flex items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <select value={eventChoice} onChange={(e) => setEventChoice(e.target.value)} aria-label="Collega a un evento" className={input}>
            <option value="">Nessun evento</option>
            {myEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                Dall&apos;evento: {ev.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* tag */}
      <section className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <Tag className="size-4 shrink-0 text-muted-foreground" />
          <input value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="Tagga persone: scrivi nome o @nome" className={input} />
        </label>
        {tagSearch.searched && found.length === 0 && (
          <p className="text-xs text-peach">Nessun personaggio trovato con «{tagQuery.trim()}»: controlla il nome o il @nome.</p>
        )}
        <p className="text-xs text-muted-foreground">Scrivi il nome o il @nome e clicca la persona proposta qui sotto: diventa una pillola rosa. Anche chi scrivi nel testo con @nome viene taggato.</p>
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
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy} className="h-11 flex-1 rounded-full border border-white/15">
            Annulla
          </Button>
        )}
        <Button type="button" onClick={publish} disabled={busy} className="h-11 flex-1 rounded-full">
          {busy ? (edit ? "Salvataggio…" : "Pubblicazione…") : edit ? "Salva le modifiche" : "Condividi"}
        </Button>
      </div>
    </div>
  );
}
