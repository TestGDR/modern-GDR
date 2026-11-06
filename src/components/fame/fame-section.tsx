"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { FameIcon } from "@/components/fame/fame-icon";
import { HoverTip } from "@/components/game/hover-tip";
import { signedPoints, type FameLevelInfo, type FameOverview } from "@/lib/fame";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Scheda → Fama: livello e barra (fama e infamia), background, badge, imprese e reputazione.
// Le voci «solo staff» arrivano solo a chi gestisce la fama (lo decide il database).

const dateIt = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export function FameSection({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<FameOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"fama" | "imprese" | "badge">("fama");

  useEffect(() => {
    let alive = true;
    supabase.rpc("fame_overview", { p_character: characterId }).then(({ data: d, error: e }) => {
      if (!alive) return;
      if (e) setError(e.message);
      else setData(d as FameOverview);
    });
    return () => {
      alive = false;
    };
  }, [supabase, characterId]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <Loader2 className="mx-auto animate-spin text-muted-foreground" />;
  const bg = data.background.filter((b) => b.status === "approvata" || data.is_staff || data.is_owner);

  return (
    <div className="flex flex-col gap-5">
      {/* linguette: la fama (barre e background), le imprese e i badge */}
      <nav className="flex flex-wrap gap-1 self-start rounded-full bg-white/5 p-1" aria-label="Fama, imprese o badge">
        {(
          [
            ["fama", "Fama"],
            ["imprese", `Imprese e reputazione${data.entries.length ? ` (${data.entries.length})` : ""}`],
            ["badge", `Badge${data.badges.length ? ` (${data.badges.length})` : ""}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 font-heading text-base tracking-wide",
              tab === k ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "badge" && (
        <>
          <Block title="Badge">
            {data.badges.length === 0 ? (
              <Empty>Nessun badge per ora.</Empty>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {data.badges.map((b) => (
                  <li key={b.id}>
                    <HoverTip
                      label={`${b.name}${b.rarity ? ` · ${b.rarity}` : ""} (${signedPoints(b.points)} ${b.kind})${b.description ? ` — ${b.description}` : ""}${b.reason ? ` · Motivo: ${b.reason}` : ""} · ${dateIt(b.date)}`}
                      className="inline-flex"
                    >
                      <span
                        className="grid size-14 place-items-center rounded-2xl border-2 bg-night/50 text-2xl shadow-lg"
                        style={{
                          borderColor: b.color,
                          boxShadow: `0 0 12px ${b.color}55`,
                        }}
                      >
                        <FameIcon icon={b.icon} label={b.name} className={b.icon.startsWith("https://") ? "size-9" : undefined} />
                      </span>
                    </HoverTip>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </>
      )}

      {tab === "fama" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.fame && <LevelBar title="Fama" level={data.fame} />}
            {data.infamy && <LevelBar title="Infamia" level={data.infamy} infamy />}
          </div>
          <LevelsGuide />
          {data.is_owner && data.converted && data.pf_converted > 0 && (
            <p className="text-xs text-muted-foreground">
              All&apos;approvazione {data.pf_converted} Punti Fama non spesi sono diventati {data.px_from_conversion} PX.
            </p>
          )}

          <Block title="Background">
            {data.max_background > 0 && bg.length > 0 && (
              <p className="text-[0.7rem] text-muted-foreground">
                Il background dà al massimo {data.max_background} punti di fama: il resto si guadagna giocando.
              </p>
            )}
            {bg.length === 0 ? (
              <Empty>Nessuna voce di background.</Empty>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {bg.map((b) => (
                  <li key={b.id} className="rounded-xl bg-white/5 px-3 py-2 text-sm">
                    <p className="flex flex-wrap items-baseline gap-2">
                      <strong className="font-medium">{b.name}</strong>
                      <span className="text-[0.7rem] text-muted-foreground">{b.category}</span>
                      <span className="ml-auto text-xs text-sand">
                        {b.fame ? `+${b.fame} fama` : ""}
                        {b.infamy ? ` · +${b.infamy} infamia` : ""}
                      </span>
                    </p>
                    {b.description && <p className="text-xs text-muted-foreground">{b.description}</p>}
                    {b.status !== "approvata" && (
                      <p className="text-[0.7rem] text-flamingo">{b.status === "in_attesa" ? "In attesa dello staff" : "Rifiutata"}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </>
      )}

      {tab === "imprese" && (
        <>
          <Block title="Imprese e reputazione">
            {data.entries.length === 0 ? (
              <Empty>Nessuna impresa registrata.</Empty>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.entries.map((e) => (
                  <li key={e.id} className="rounded-xl bg-white/5 px-3 py-2 text-sm">
                    <p className="flex flex-wrap items-baseline gap-2">
                      <strong className="font-medium">{e.title}</strong>
                      {!e.public && <span className="rounded bg-violet/40 px-1.5 text-[0.6rem] tracking-wider text-lavender uppercase">solo staff</span>}
                      <span
                        className={cn(
                          "ml-auto text-xs font-semibold",
                          e.kind === "infamia" ? "text-flamingo" : e.points >= 0 ? "text-mint" : "text-destructive",
                        )}
                      >
                        {signedPoints(e.points)} {e.kind}
                      </span>
                    </p>
                    {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                    <p className="text-[0.65rem] text-muted-foreground">{dateIt(e.date)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </>
      )}

      {data.is_staff && (
        <Link href="/gestione/fama" className="self-start text-xs text-lavender underline hover:text-white">
          Gestisci la fama di questo personaggio (Gestione → Fama)
        </Link>
      )}
    </div>
  );
}

/** Nome del livello, punti e barra verso il successivo */
type GuideLevel = { id: string; kind: "fama" | "infamia"; name: string; min_points: number; icon: string; color: string; description: string; gossip_bonus: number };

/** Tutti i livelli di fama e infamia con le indicazioni per giocarli */
function LevelsGuide() {
  const supabase = useMemo(() => createClient(), []);
  const [levels, setLevels] = useState<GuideLevel[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || levels) return;
    supabase
      .from("fame_levels")
      .select("id, kind, name, min_points, icon, color, description, gossip_bonus")
      .order("kind")
      .order("min_points")
      .then(({ data }) => setLevels((data ?? []) as GuideLevel[]));
  }, [supabase, open, levels]);
  return (
    <details className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer font-medium">Come si gioca la fama: tutti i livelli</summary>
      {!levels ? (
        <Loader2 className="mt-2 animate-spin text-muted-foreground" />
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          {(["fama", "infamia"] as const).map((k) => (
            <section key={k} className="flex flex-col gap-1.5">
              <h4 className={cn("font-heading text-lg tracking-wide", k === "fama" ? "text-peach" : "text-flamingo")}>{k === "fama" ? "Fama" : "Infamia"}</h4>
              {levels
                .filter((l) => l.kind === k)
                .map((l) => (
                  <div key={l.id} className="rounded-xl bg-night/30 px-3 py-2">
                    <p className="flex flex-wrap items-center gap-2">
                      <FameIcon icon={l.icon} label={l.name} />
                      <strong style={{ color: l.color }}>{l.name}</strong>
                      <span className="text-xs text-muted-foreground">da {l.min_points} punti</span>
                      {l.gossip_bonus > 0 && <span className="text-xs text-lavender">· pettegolezzi in pubblico +{l.gossip_bonus}</span>}
                    </p>
                    {l.description && <p className="mt-1 text-xs leading-relaxed whitespace-pre-line text-foreground/80">{l.description}</p>}
                  </div>
                ))}
            </section>
          ))}
          <p className="text-[0.7rem] text-muted-foreground">
            Pettegolezzi: a fine giocata in una chat pubblica il bonus del tuo livello (il più alto tra fama e infamia) si somma al dado: più sei conosciuto, più è facile che qualcuno ti noti.
          </p>
        </div>
      )}
    </details>
  );
}

export function LevelBar({ title, level, infamy = false }: { title: string; level: FameLevelInfo; infamy?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="text-[0.65rem] tracking-widest text-muted-foreground uppercase">{title}</p>
      <p className="flex items-center gap-2">
        <FameIcon icon={level.icon} label={level.name} className="text-xl" />
        <span className="font-heading text-2xl tracking-wide" style={{ color: level.color }}>
          {level.name}
        </span>
        <span className="ml-auto text-sm text-muted-foreground">{level.points} punti</span>
      </p>
      <div
        className="h-2 overflow-hidden rounded-full bg-night/60"
        role="progressbar"
        aria-valuenow={level.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${title}: ${level.pct}%`}
      >
        <div
          className={cn("h-full rounded-full", infamy ? "bg-gradient-to-r from-orchid to-flamingo" : "bg-gradient-to-r from-peach to-flamingo")}
          style={{ width: `${level.pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {level.next_name ? `Mancano ${level.missing} punti a «${level.next_name}»` : "Livello più alto raggiunto"}
      </p>
      {level.description && <p className="border-t border-white/10 pt-1.5 text-xs leading-relaxed whitespace-pre-line text-foreground/80">{level.description}</p>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-heading text-xl tracking-wide text-peach">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
