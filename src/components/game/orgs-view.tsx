"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BriefcaseBusiness, ChevronDown, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NeedsCharacter } from "@/components/game/needs-character";
import { joinJob, leaveJob } from "@/lib/actions/orgs";
import { formatDollars, periodLabel } from "@/lib/bank";
import { JOB_KIND_LABEL, type Org, type OrgKind } from "@/lib/orgs";
import { cn } from "@/lib/utils";

type Props = {
  kind: OrgKind;
  orgs: Org[];
  /** Il personaggio approvato del giocatore (null se non ce l'ha) */
  characterId: string | null;
  periodDays: number;
  maxGroups: number;
};

/** Utility → Lavori o Gruppi: descrizioni, ruoli, membri; i lavori si scelgono da qui */
export function OrgsView({ kind, orgs, characterId, periodDays, maxGroups }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const visible = orgs.filter((o) => o.active);
  const mine = characterId ? visible.filter((o) => o.members.some((m) => m.character_id === characterId)) : [];

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Operazione non riuscita.");
    });
  }

  const sections =
    kind === "job"
      ? [
          { title: "Full time", items: visible.filter((o) => o.kind === "full_time") },
          { title: "Part time", items: visible.filter((o) => o.kind === "part_time") },
        ]
      : [{ title: "", items: visible }];

  return (
    <div className="flex flex-col gap-5">
      {/* I propri lavori o gruppi */}
      {characterId ? (
        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <p className="flex items-center gap-2 font-heading text-2xl tracking-wide">
            {kind === "job" ? <BriefcaseBusiness className="size-5 text-sand" /> : <Users className="size-5 text-mint" />}
            {kind === "job" ? "I tuoi lavori" : "I tuoi gruppi"}
          </p>
          {mine.length === 0 && <p className="text-muted-foreground">{kind === "job" ? "Nessun lavoro: sceglilo qui sotto." : "Non fai parte di nessun gruppo."}</p>}
          <ul className="flex flex-col gap-1">
            {mine.map((o) => {
              const role = o.roles.find((r) => r.id === o.members.find((m) => m.character_id === characterId)?.role_id);
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{o.name}</span>
                  {o.kind && <KindBadge kind={o.kind} />}
                  {role && <span className="text-muted-foreground">· {role.name}</span>}
                  {kind === "job" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      className="ml-auto"
                      onClick={() => window.confirm(`Lasciare il lavoro «${o.name}»?`) && act(() => leaveJob(characterId, o.id))}
                    >
                      <LogOut /> Lascia
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            {kind === "job"
              ? "Puoi avere un full time, un part time, un full time e un part time insieme, oppure due part time. Mai due full time. I ruoli segnati «dallo staff» si chiedono con un ticket."
              : `I gruppi li assegna lo staff: per entrare in un gruppo apri un ticket. Al massimo ${maxGroups} gruppi per personaggio.`}
          </p>
          {error && <p className="rounded-lg bg-destructive/15 px-3 py-2 text-destructive">{error}</p>}
        </section>
      ) : (
        <NeedsCharacter
          className="glass rounded-2xl"
          text={kind === "job" ? "Per scegliere un lavoro serve un personaggio approvato." : "I gruppi si assegnano ai personaggi approvati."}
        />
      )}

      {sections.map((s) => (
        <section key={s.title || "tutti"} className="flex flex-col gap-2">
          {s.title && <h2 className="border-b border-white/10 pb-1 font-heading text-2xl tracking-wide text-peach">{s.title}</h2>}
          {s.items.map((o) => (
            <OrgCard
              key={o.id}
              org={o}
              kind={kind}
              characterId={characterId}
              periodDays={periodDays}
              pending={pending}
              onJoin={(roleId) => characterId && act(() => joinJob(characterId, roleId))}
            />
          ))}
          {s.items.length === 0 && <p className="text-sm text-muted-foreground">{kind === "job" ? "Nessun lavoro." : "Nessun gruppo."}</p>}
        </section>
      ))}
    </div>
  );
}

function KindBadge({ kind }: { kind: NonNullable<Org["kind"]> }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem]", kind === "full_time" ? "bg-flamingo/20 text-flamingo" : "bg-lavender/15 text-lavender")}>
      {JOB_KIND_LABEL[kind]}
    </span>
  );
}

function OrgCard({
  org,
  kind,
  characterId,
  periodDays,
  pending,
  onJoin,
}: {
  org: Org;
  kind: OrgKind;
  characterId: string | null;
  periodDays: number;
  pending: boolean;
  onJoin: (roleId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const myRole = org.members.find((m) => m.character_id === characterId)?.role_id;
  return (
    <div className="glass rounded-2xl">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-2xl tracking-wide">{org.name}</span>
            {org.kind && <KindBadge kind={org.kind} />}
          </span>
          <span className="block text-xs text-muted-foreground">
            {org.members.length} {org.members.length === 1 ? "membro" : "membri"} · {org.roles.length} {org.roles.length === 1 ? "ruolo" : "ruoli"}
          </span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-white/10 p-4">
          {org.description ? <p className="text-sm whitespace-pre-line">{org.description}</p> : <p className="text-sm text-muted-foreground">Nessuna descrizione.</p>}
          <ul className="flex flex-col gap-3">
            {org.roles.map((r) => {
              const members = org.members.filter((m) => m.role_id === r.id);
              return (
                <li key={r.id} className="rounded-xl bg-white/5 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-sand">{r.salary > 0 ? `${formatDollars(r.salary)} ${periodLabel(periodDays)}` : "senza stipendio"}</span>
                    {kind === "job" && !r.self_select && <span className="text-xs text-muted-foreground">· assegnato dallo staff</span>}
                    {kind === "job" && characterId && r.self_select && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending || myRole === r.id}
                        className="ml-auto rounded-full"
                        onClick={() => window.confirm(`Diventare «${r.name}» in ${org.name}?`) && onJoin(r.id)}
                      >
                        {myRole === r.id ? "Il tuo ruolo" : myRole ? "Cambia ruolo" : "Scegli"}
                      </Button>
                    )}
                  </div>
                  {r.description && <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">{r.description}</p>}
                  {members.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {members.map((m) => (
                        <Link key={m.character_id} href={`/scheda/${m.character_id}`} className="rounded-full bg-night/50 px-2.5 py-0.5 text-xs text-lavender hover:bg-white/10">
                          {m.name}
                        </Link>
                      ))}
                    </p>
                  )}
                </li>
              );
            })}
            {org.roles.length === 0 && <li className="text-sm text-muted-foreground">Nessun ruolo.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
