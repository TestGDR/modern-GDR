"use client";

import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/** "1:05" */
const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

/** Piccolo lettore della musica della scheda: play/pausa, barra e tempo (parte solo con un clic) */
export function SheetMusic({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [failed, setFailed] = useState(false);

  // chiudendo la scheda la musica si ferma
  useEffect(() => {
    const a = audio.current;
    return () => a?.pause();
  }, []);

  async function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      try {
        await a.play();
      } catch {
        setFailed(true);
      }
    } else a.pause();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audio.current;
    if (!a || !length) return;
    const box = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - box.left) / box.width) * length;
  }

  return (
    <span className="flex w-36 items-center gap-1.5 rounded-full border border-white/10 bg-night/50 py-1 pr-2.5 pl-1" title="Musica del personaggio">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setLength(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        onClick={toggle}
        disabled={failed}
        aria-label={playing ? "Metti in pausa la musica" : "Ascolta la musica del personaggio"}
        className={cn("grid size-6 shrink-0 place-items-center rounded-full bg-flamingo/80 text-night transition-colors hover:bg-flamingo disabled:bg-white/10 disabled:text-white/30")}
      >
        {failed ? <Music className="size-3" /> : playing ? <Pause className="size-3" /> : <Play className="size-3 translate-x-px" />}
      </button>
      {failed ? (
        <span className="truncate text-[0.6rem] text-muted-foreground">Audio non disponibile</span>
      ) : (
        <>
          <div className="relative h-1 min-w-0 flex-1 cursor-pointer rounded-full bg-white/15" onClick={seek} role="presentation">
            <div className="absolute inset-y-0 left-0 rounded-full bg-flamingo" style={{ width: length ? `${(time / length) * 100}%` : "0%" }} />
          </div>
          <span className="shrink-0 text-[0.6rem] text-muted-foreground tabular-nums">{clock(playing || time ? time : length)}</span>
        </>
      )}
    </span>
  );
}
