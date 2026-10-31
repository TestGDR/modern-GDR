"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Moon, Pill, Wine, X, type LucideIcon } from "lucide-react";
import { HoverTip } from "@/components/game/hover-tip";
import { LevelIcon } from "@/components/game/level-icon";
import { modsText, timeLeft, type AlterationStage } from "@/lib/market";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Accanto al ritratto della scheda: l'icona del ruolo staff e le icone degli stati
// (alcol, droghe, insonnia). Attivi: colorati, cliccando si legge la descrizione.
// Non attivi: grigio scuro, "Non attivo".

type Alteration = AlterationStage & { phase: "stadio" | "postumi"; stage?: number; until: string; source: string };
type Status = {
  alcol: Alteration | null;
  droga: Alteration | null;
  insonnia: { has_trait: boolean; active: boolean; total: number | null; cd: number | null; malus: number; until: string };
};
type Level = { name: string; icon_url: string | null };

type Item = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  active: boolean;
  title: string;
  lines: string[];
  until: string | null;
};

export function SheetStatus({ characterId }: { characterId: string }) {
  const [level, setLevel] = useState<Level | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    const load = () =>
      Promise.all([
        supabase.rpc("character_owner_level", { p_character: characterId }),
        supabase.rpc("character_status_get", { p_character: characterId }),
      ]).then(([l, s]) => {
        if (!alive) return;
        setLevel((l.data ?? null) as Level | null);
        setStatus((s.data ?? null) as Status | null);
        setNow(Date.now());
      });
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [characterId]);

  const alteration = (key: "alcol" | "droga", label: string, icon: LucideIcon, color: string): Item => {
    const a = status?.[key] ?? null;
    return {
      key,
      label,
      icon,
      color,
      active: !!a,
      title: a?.name ?? label,
      lines: a
        ? [
            a.phase === "stadio" ? `${label} · stadio ${a.stage} di 3 · da ${a.source}` : `Postumi · da ${a.source}`,
            a.text,
            modsText(a.mods) ? `Malus ai tiri: ${modsText(a.mods)}` : "",
          ].filter(Boolean)
        : [],
      until: a?.until ?? null,
    };
  };
  const ins = status?.insonnia;
  const items: Item[] = [
    alteration("alcol", "Alcol", Wine, "text-peach border-peach/50 bg-peach/15"),
    alteration("droga", "Droghe", Pill, "text-orchid border-orchid/50 bg-orchid/15"),
    {
      key: "insonnia",
      label: "Insonnia",
      icon: Moon,
      color: "text-lavender border-lavender/50 bg-lavender/15",
      active: !!ins?.active,
      title: "Notte in bianco",
      lines: ins?.active
        ? [
            `Stanotte non ha chiuso occhio (resistenza ${ins.total} contro ${ins.cd}): occhiaie, sbadigli, poca concentrazione.`,
            `Malus a tutti i tiri: −${ins.malus}`,
          ]
        : [],
      until: ins?.active ? ins.until : null,
    },
  ];

  return (
    <span className="flex flex-col items-center gap-2">
      {level?.icon_url && (
        <span className="flex flex-col items-center gap-1">
          <LevelIcon icon={level.icon_url} name={level.name} className="size-7" />
          <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{level.name}</span>
        </span>
      )}
      {status && (
        <span className="flex gap-1.5">
          {items.map((it) =>
            it.active ? (
              <StatusButton key={it.key} item={it} open={open === it.key} now={now} onToggle={() => setOpen(open === it.key ? null : it.key)} />
            ) : (
              <HoverTip key={it.key} label={`${it.label}: non attivo`} className="inline-flex">
                <span className="grid size-7 place-items-center rounded-full border border-white/5 bg-white/[0.03] text-white/20" aria-label={`${it.label}: non attivo`}>
                  <it.icon className="size-3.5" />
                </span>
              </HoverTip>
            ),
          )}
        </span>
      )}
    </span>
  );
}

/** Stato attivo: icona colorata; cliccando si apre la descrizione (sempre dentro lo schermo) */
function StatusButton({ item, open, now, onToggle }: { item: Item; open: boolean; now: number; onToggle: () => void }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !panel.current) {
      setPos(null);
      return;
    }
    const a = anchor.current.getBoundingClientRect();
    const p = panel.current.getBoundingClientRect();
    let top = a.bottom + 8;
    if (top + p.height > window.innerHeight - 8) top = a.top - p.height - 8;
    top = Math.max(8, Math.min(top, window.innerHeight - p.height - 8));
    const left = Math.max(8, Math.min(a.left + a.width / 2 - p.width / 2, window.innerWidth - p.width - 8));
    setPos({ left, top });
  }, [open]);

  return (
    <>
      <HoverTip label={item.title} className="inline-flex">
        <button
          ref={anchor}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${item.label}: ${item.title}`}
          className={cn("grid size-7 place-items-center rounded-full border shadow-[0_0_10px_-2px_currentColor] transition-transform hover:scale-110", item.color)}
        >
          <item.icon className="size-3.5" />
        </button>
      </HoverTip>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={item.title}
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
            className="fixed z-[2147483000] w-[min(18rem,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-night/95 p-3 text-sm shadow-2xl backdrop-blur"
          >
            <p className="flex items-center gap-2">
              <item.icon className={cn("size-4", item.color.split(" ")[0])} />
              <strong className="flex-1">{item.title}</strong>
              <button type="button" onClick={onToggle} className="rounded p-0.5 text-muted-foreground hover:bg-white/10" aria-label="Chiudi">
                <X className="size-3.5" />
              </button>
            </p>
            {item.lines.map((l) => (
              <p key={l} className="mt-1 text-xs text-muted-foreground first-of-type:text-lavender">
                {l}
              </p>
            ))}
            {item.until && <p className="mt-2 text-[0.7rem] text-muted-foreground">Finisce tra {timeLeft(item.until, now)}</p>}
          </div>,
          document.body,
        )}
    </>
  );
}
