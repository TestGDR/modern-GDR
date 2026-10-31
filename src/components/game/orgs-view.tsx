"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, ChevronRight, LogOut, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NeedsCharacter } from "@/components/game/needs-character";
import { SafeHtml } from "@/components/guide/safe-html";
import { joinJob, leaveJob } from "@/lib/actions/orgs";
import { formatDollars, periodLabel } from "@/lib/bank";
import { JOB_KIND_LABEL, type GroupCategory, type JobKind, type Org, type OrgKind, type OrgRole } from "@/lib/orgs";
import { cn } from "@/lib/utils";

type Props = {
  kind: OrgKind;
  orgs: Org[];
  /** Gruppi: gli ambiti, una scheda ciascuno */
  categories?: GroupCategory[];
  /** Il personaggio approvato del giocatore (null se non ce l'ha) */
  characterId: string | null;
  periodDays: number;
  maxGroups: number;
};

/**
 * Utility → Lavori o Gruppi: prima l'elenco (gruppi divisi per ambito),
 * cliccando un nome si apre la sua pagina con descrizione, ruoli e membri.
 * I lavori si scelgono da qui (ruolo e orario); i ruoli pieni sono grigi.
 */
export function OrgsView({ kind, orgs, categories = [], characterId, periodDays, maxGroups }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tab, setTab] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = orgs.filter((o) => o.active);
  const mine = characterId ? visible.filter((o) => o.members.some((m) => m.character_id === characterId)) : [];
  const open = visible.find((o) => o.id === openId) ?? null;

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Operazione non riuscita.");
    });
  }

  if (open) {
    return (
      <OrgPage
        org={open}
        kind={kind}
        characterId={characterId}
        periodDays={periodDays}
        pending={pending}
        error={error}
        onBack={() => {
          setOpenId(null);
          setError(null);
        }}
        onJoin={(roleId, mode) => characterId && act(() => joinJob(characterId, roleId, mode))}
        onLeave={() => characterId && act(() => leaveJob(characterId, open.id))}
      />
    );
  }

  const sections: Section[] = kind === "job" ? [{ title: "Lavori", items: visible }] : groupSections(visible, categories);
  const current = Math.min(tab, sections.length - 1);

  return (
    <div className="flex flex-col gap-5">
      {/* I propri lavori o gruppi */}
      {characterId ? (
        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <p className="flex items-center gap-2 font-heading text-2xl tracking-wide">
            {kind === "job" ? <BriefcaseBusiness className="size-5 text-sand" /> : <Users className="size-5 text-mint" />}
            {kind === "job" ? "I tuoi lavori" : "I tuoi gruppi"}
          </p>
          {mine.length === 0 && <p className="text-muted-foreground">{kind === "job" ? "Nessun lavoro: aprine uno qui sotto e scegli il ruolo." : "Non fai parte di nessun gruppo."}</p>}
          <ul className="flex flex-col gap-1">
            {mine.map((o) => {
              const me = o.members.find((m) => m.character_id === characterId);
              const role = o.roles.find((r) => r.id === me?.role_id);
              return (
                <li key={o.id}>
                  <button type="button" onClick={() => setOpenId(o.id)} className="flex w-full flex-wrap items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-white/5">
                    <OrgIcon url={o.icon_url} />
                    <span className="font-medium">{o.name}</span>
                    {me?.mode && <ModeBadge mode={me.mode} />}
                    {o.sport && <SportBadge />}
                    {role && <span className="text-muted-foreground">· {role.name}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            {kind === "job"
              ? "Puoi avere un full time, un part time, un full time e un part time insieme, oppure due part time. Mai due full time. I ruoli segnati «dallo staff» si chiedono con un ticket."
              : `I gruppi di gioco li assegna lo staff: per entrare apri un ticket. Al massimo ${maxGroups} gruppi per personaggio; le squadre sportive non contano.`}
          </p>
        </section>
      ) : (
        <NeedsCharacter
          className="glass rounded-2xl"
          text={kind === "job" ? "Per scegliere un lavoro serve un personaggio approvato." : "I gruppi si assegnano ai personaggi approvati."}
        />
      )}

      {/* Una scheda per ambito (solo i gruppi) */}
      {sections.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-white/10" role="tablist">
          {sections.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={current === i}
              onClick={() => setTab(i)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 font-heading text-xl tracking-wide transition-colors",
                current === i ? "border-flamingo text-peach" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.sport ? <Trophy className="size-4" /> : <Users className="size-4" />}
              {s.title}
              <span className="rounded-full bg-white/10 px-1.5 font-sans text-xs">{s.items.length}</span>
            </button>
          ))}
        </nav>
      )}

      {sections
        .filter((_, i) => i === current)
        .map((s) => (
          <section key={s.title} role={sections.length > 1 ? "tabpanel" : undefined} className="flex flex-col gap-2">
            {s.sport && (
              <p className="text-xs text-muted-foreground">
                Ogni sport ha la sua squadra: si entra e si esce dalla pagina{" "}
                <Link href="/sport" className="text-peach hover:underline">
                  Sport
                </Link>
                , dove ci sono anche calendario, risultati e classifiche. Niente stipendio.
              </p>
            )}
            <ul className="flex flex-col gap-1.5">
              {s.items.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setOpenId(o.id)} className="glass flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-white/10">
                    <OrgIcon url={o.icon_url} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-heading text-xl tracking-wide">{o.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {o.members.length} {o.members.length === 1 ? "membro" : "membri"}
                        {kind === "job" && payRange(o.roles)}
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
            {s.items.length === 0 && <p className="text-sm text-muted-foreground">{kind === "job" ? "Nessun lavoro." : s.sport ? "Nessuna squadra." : "Nessun gruppo."}</p>}
          </section>
        ))}
    </div>
  );
}

type Section = { title: string; items: Org[]; sport?: boolean };

/** Una scheda per ambito; le squadre vanno nell'ambito "per lo sport", i gruppi senza ambito in "Altri gruppi" */
function groupSections(visible: Org[], categories: GroupCategory[]): Section[] {
  const known = new Set(categories.map((c) => c.id));
  const sportCat = categories.find((c) => c.for_sport);
  const sections: Section[] = categories.map((c) => ({
    title: c.name,
    sport: c.for_sport,
    items: visible.filter((o) => (o.sport ? c.for_sport : o.category_id === c.id)),
  }));
  const others = visible.filter((o) => !o.sport && !(o.category_id && known.has(o.category_id)));
  if (others.length) sections.push({ title: "Altri gruppi", items: others });
  if (!sportCat) {
    const teams = visible.filter((o) => o.sport);
    if (teams.length) sections.push({ title: "Squadre sportive", sport: true, items: teams });
  }
  return sections.length ? sections : [{ title: "Gruppi", items: [] }];
}

/** " · FT fino a 3.000 $ · PT fino a 1.200 $" */
function payRange(roles: OrgRole[]) {
  const max = (vals: (number | null)[]) => Math.max(...vals.filter((v): v is number => v !== null));
  const full = roles.some((r) => r.salary_full !== null) ? ` · FT fino a ${formatDollars(max(roles.map((r) => r.salary_full)))}` : "";
  const part = roles.some((r) => r.salary_part !== null) ? ` · PT fino a ${formatDollars(max(roles.map((r) => r.salary_part)))}` : "";
  return full + part;
}

/** Pagina di un lavoro o gruppo: descrizione, ruoli (con paga e posti) e membri */
function OrgPage({
  org,
  kind,
  characterId,
  periodDays,
  pending,
  error,
  onBack,
  onJoin,
  onLeave,
}: {
  org: Org;
  kind: OrgKind;
  characterId: string | null;
  periodDays: number;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onJoin: (roleId: string, mode: JobKind) => void;
  onLeave: () => void;
}) {
  const me = org.members.find((m) => m.character_id === characterId);
  const roleName = (id: string) => org.roles.find((r) => r.id === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex w-fit items-center gap-1.5 text-sm text-lavender hover:underline">
        <ArrowLeft className="size-4" /> {kind === "job" ? "Tutti i lavori" : "Tutti i gruppi"}
      </button>

      <header className="flex flex-wrap items-center gap-2">
        <OrgIcon url={org.icon_url} />
        <h2 className="font-heading text-3xl tracking-wide text-sunset">{org.name}</h2>
        {org.sport && <SportBadge />}
        {kind === "job" && me && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            className="ml-auto"
            onClick={() => window.confirm(`Lasciare il lavoro «${org.name}»?`) && onLeave()}
          >
            <LogOut /> Lascia il lavoro
          </Button>
        )}
      </header>
      {org.description ? <SafeHtml html={org.description} className="text-sm" /> : <p className="text-sm text-muted-foreground">Nessuna descrizione.</p>}
      {error && <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}

      {/* Ruoli */}
      <section className="flex flex-col gap-2">
        <h3 className="border-b border-white/10 pb-1 font-heading text-2xl tracking-wide text-peach">Ruoli</h3>
        <ul className="flex flex-col gap-2">
          {org.roles.map((r) => {
            const taken = org.members.filter((m) => m.role_id === r.id).length;
            const mineHere = me?.role_id === r.id;
            const full = r.max_members !== null && taken >= r.max_members && !mineHere;
            const canPick = kind === "job" && !!characterId && r.self_select && !full;
            return (
              <li key={r.id} className={cn("glass flex flex-col gap-2 rounded-xl p-3", full && "opacity-50 grayscale", mineHere && "border border-mint/50")}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.max_members !== null ? `${taken}/${r.max_members} posti` : `${taken} ${taken === 1 ? "membro" : "membri"}`}
                    {full && " · al completo"}
                  </span>
                  {mineHere && <span className="text-xs text-mint">Il tuo ruolo{me?.mode ? ` (${JOB_KIND_LABEL[me.mode].toLowerCase()})` : ""}</span>}
                  {kind === "job" && !r.self_select && <span className="text-xs text-muted-foreground">· assegnato dallo staff</span>}
                </div>
                {r.description && <p className="text-xs whitespace-pre-line text-muted-foreground">{r.description}</p>}
                {kind === "job" ? (
                  <div className="flex flex-wrap gap-2">
                    {(["full_time", "part_time"] as const).map((mode) => {
                      const pay = mode === "full_time" ? r.salary_full : r.salary_part;
                      if (pay === null) return null;
                      const current = mineHere && me?.mode === mode;
                      return (
                        <span key={mode} className="flex items-center gap-2 rounded-lg bg-white/5 py-1 pr-1 pl-2.5 text-sm">
                          <span className="text-xs text-muted-foreground">{JOB_KIND_LABEL[mode]}</span>
                          <span className="font-medium text-sand tabular-nums">
                            {formatDollars(pay)} <span className="text-xs font-normal text-muted-foreground">{periodLabel(periodDays)}</span>
                          </span>
                          {canPick && (
                            <Button
                              type="button"
                              size="xs"
                              disabled={pending || current}
                              className="rounded-full"
                              onClick={() => window.confirm(`Diventare «${r.name}» (${JOB_KIND_LABEL[mode].toLowerCase()}) in ${org.name}?`) && onJoin(r.id, mode)}
                            >
                              {current ? "Scelto" : "Scegli"}
                            </Button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-sand">{r.salary > 0 ? `${formatDollars(r.salary)} ${periodLabel(periodDays)}` : "Senza stipendio"}</p>
                )}
              </li>
            );
          })}
          {org.roles.length === 0 && <li className="text-sm text-muted-foreground">Nessun ruolo.</li>}
        </ul>
      </section>

      {/* Membri */}
      <section className="flex flex-col gap-2">
        <h3 className="border-b border-white/10 pb-1 font-heading text-2xl tracking-wide text-peach">Membri ({org.members.length})</h3>
        {org.members.length === 0 && <p className="text-sm text-muted-foreground">Ancora nessuno.</p>}
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {org.members.map((m) => (
            <li key={m.character_id}>
              <Link href={`/scheda/${m.character_id}`} className="flex items-center gap-2.5 rounded-xl bg-white/5 p-2 text-sm transition-colors hover:bg-white/10">
                {m.avatar_url ? (
                  // ritratto del personaggio (link esterno)
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatar_url} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-orchid/30 font-heading">{m.name.charAt(0)}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {roleName(m.role_id)}
                    {m.mode && ` · ${JOB_KIND_LABEL[m.mode].toLowerCase()}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ModeBadge({ mode }: { mode: JobKind }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem]", mode === "full_time" ? "bg-flamingo/20 text-flamingo" : "bg-lavender/15 text-lavender")}>
      {JOB_KIND_LABEL[mode]}
    </span>
  );
}

function SportBadge() {
  return (
    <span className="flex items-center gap-1 rounded-full bg-mint/15 px-2 py-0.5 text-[0.7rem] text-mint">
      <Trophy className="size-3" /> Squadra
    </span>
  );
}

/** Icona del lavoro o del gruppo (30x30) */
export function OrgIcon({ url }: { url: string | null | undefined }) {
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-[30px] shrink-0 rounded object-contain" />;
}
