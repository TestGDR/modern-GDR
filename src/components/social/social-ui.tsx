"use client";

import { createContext, useContext, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { initials } from "@/lib/format";
import { handleOf, splitMentions, youtubeId, type Media, type SocialPerson } from "@/lib/social";
import type { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/* ------------------------------ Navigazione dentro il social ------------------------------ */

export type SocialView =
  | { kind: "feed" }
  | { kind: "search" }
  | { kind: "new" }
  | { kind: "activity" }
  | { kind: "profile"; id: string }
  | { kind: "post"; id: string }
  | { kind: "follows"; id: string; which: "followers" | "following" }
  | { kind: "dms" }
  | { kind: "dm"; id: string }
  | { kind: "setup" };

export type Me = { id: string; name: string; avatar_url: string | null; handle: string | null };

type Ctx = {
  supabase: ReturnType<typeof createClient>;
  /** Il mio personaggio (null = solo lettura) */
  me: Me | null;
  canModerate: boolean;
  go: (v: SocialView) => void;
  /** Apre il profilo da un @nome */
  goHandle: (handle: string) => void;
  /** Il mio elenco "seguiti" (per i pulsanti Segui) */
  following: Set<string>;
  toggleFollow: (id: string) => Promise<void>;
};

export const SocialCtx = createContext<Ctx | null>(null);

export function useSocial() {
  const c = useContext(SocialCtx);
  if (!c) throw new Error("useSocial fuori dal social");
  return c;
}

/* ------------------------------ Pezzi grafici ------------------------------ */

export function Avatar({ person, size = "size-9", ring }: { person: Pick<SocialPerson, "name" | "avatar_url"> | null; size?: string; ring?: boolean }) {
  const name = person?.name ?? "?";
  const cls = cn(size, "shrink-0 rounded-full object-cover", ring && "ring-2 ring-flamingo ring-offset-2 ring-offset-night");
  return person?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.avatar_url} alt="" className={cls} />
  ) : (
    <span className={cn(cls, "grid place-items-center bg-gradient-to-br from-violet via-orchid to-peach font-heading text-white")}>{initials(name)}</span>
  );
}

/** Nome cliccabile: apre il profilo */
export function PersonName({ person, className }: { person: SocialPerson | null; className?: string }) {
  const { go } = useSocial();
  if (!person) return <span className={className}>utente</span>;
  return (
    <button type="button" onClick={() => go({ kind: "profile", id: person.id })} className={cn("font-semibold hover:underline", className)}>
      {handleOf(person)}
    </button>
  );
}

/** Testo con @nomi cliccabili */
export function Caption({ text, className }: { text: string; className?: string }) {
  const { goHandle } = useSocial();
  return (
    <span className={cn("break-words whitespace-pre-line", className)}>
      {splitMentions(text).map((p, i) =>
        p.handle ? (
          <button key={i} type="button" onClick={() => goHandle(p.handle!)} className="font-medium text-lavender hover:underline">
            {p.text}
          </button>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

/** Un media: foto, video o YouTube */
export function MediaItem({ media, thumb }: { media: Media; thumb?: boolean }) {
  if (media.type === "youtube") {
    const id = youtubeId(media.url);
    if (thumb) {
      return (
        <span className="relative block size-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="size-full object-cover" />
          <Play className="absolute top-2 right-2 size-4 fill-white text-white drop-shadow" />
        </span>
      );
    }
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title="Video"
        className="size-full"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }
  if (media.type === "video") {
    return thumb ? (
      <span className="relative block size-full bg-black">
        <video src={media.url} muted playsInline preload="metadata" className="size-full object-cover" />
        <Play className="absolute top-2 right-2 size-4 fill-white text-white drop-shadow" />
      </span>
    ) : (
      <video src={media.url} controls playsInline preload="metadata" className="size-full bg-black object-contain" />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={media.url} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn("size-full", thumb ? "object-cover" : "object-contain")} />;
}

/** Carosello: frecce e pallini se ci sono più media */
export function Carousel({ media }: { media: Media[] }) {
  const [i, setI] = useState(0);
  if (media.length === 0) return null;
  const cur = media[Math.min(i, media.length - 1)];
  return (
    <div className="relative aspect-square w-full overflow-hidden bg-black/60">
      <MediaItem key={`${i}-${cur.url}`} media={cur} />
      {media.length > 1 && (
        <>
          {i > 0 && (
            <button type="button" onClick={() => setI(i - 1)} className="absolute top-1/2 left-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-night/70 text-white" aria-label="Precedente">
              <ChevronLeft className="size-5" />
            </button>
          )}
          {i < media.length - 1 && (
            <button type="button" onClick={() => setI(i + 1)} className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-night/70 text-white" aria-label="Successivo">
              <ChevronRight className="size-5" />
            </button>
          )}
          <span className="absolute top-2 right-2 rounded-full bg-night/70 px-2 py-0.5 text-[0.7rem] text-white">
            {i + 1}/{media.length}
          </span>
          <span className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {media.map((_, k) => (
              <span key={k} className={cn("size-1.5 rounded-full", k === i ? "bg-white" : "bg-white/40")} />
            ))}
          </span>
        </>
      )}
    </div>
  );
}
