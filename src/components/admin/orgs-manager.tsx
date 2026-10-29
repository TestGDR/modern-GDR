"use client";

import { useState } from "react";
import { ChevronDown, Pencil, Plus, UserPlus, X } from "lucide-react";
import { ActiveToggle, DeleteButton, ErrorText, FieldLabel, MoveButtons, StatusPill, inputClass, textareaClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { assignMember, deleteOrg, deleteOrgRole, moveOrgItem, removeMember, saveOrg, saveOrgRole, type OrgInput, type RoleInput } from "@/lib/actions/orgs";
import { formatDollars } from "@/lib/bank";
import { JOB_KIND_LABEL, ORG_LABELS, type JobKind, type Org, type OrgKind, type OrgRole } from "@/lib/orgs";
import { cn } from "@/lib/utils";

type CharacterOption = { id: string; name: string };
type Props = { kind: OrgKind; orgs: Org[]; characters: CharacterOption[] };

/** Gestione → Lavori / Gruppi: crea, modifica, ruoli e assegnazioni */
export function OrgsManager({ kind, orgs, characters }: Props) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { pending, error, execute } = useAdminAction();
  const label = ORG_LABELS[kind];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {kind === "job"
          ? "Ogni personaggio può avere al massimo due lavori, mai due full time. I ruoli «a scelta del giocatore» si scelgono da Utility → Lavori; gli altri li assegni tu da qui."
          : "I gruppi li assegni solo tu da qui: i giocatori li vedono in Utility → Gruppi. Il numero massimo per personaggio è in Impostazioni del sistema."}{" "}
        Lo stipendio (mensile, automatico) di ogni ruolo si somma alle entrate del patrimonio.
      </p>
      <ErrorText error={error} />
      {editing === "new" ? (
        <OrgForm kind={kind} onDone={() => setEditing(null)} />
      ) : (
        <Button type="button" onClick={() => setEditing("new")} className="w-fit rounded-full">
          <Plus /> Nuovo {label.one}
        </Button>
      )}
      <ul className="flex flex-col gap-2">
        {orgs.map((o, i) =>
          editing === o.id ? (
            <li key={o.id}>
              <OrgForm kind={kind} org={o} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={o.id} className="glass rounded-2xl">
              <div className="flex items-center gap-2 p-3">
                <MoveButtons first={i === 0} last={i === orgs.length - 1} disabled={pending} onMove={(d) => execute(() => moveOrgItem(kind, o.id, d))} />
                <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{o.name}</span>
                      {o.kind && <span className="text-xs text-lavender">{JOB_KIND_LABEL[o.kind]}</span>}
                      <StatusPill active={o.active} />
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {o.roles.length} ruoli · {o.members.length} membri
                    </span>
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open === o.id && "rotate-180")} />
                </button>
                <button type="button" onClick={() => setEditing(o.id)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label={`Modifica ${o.name}`}>
                  <Pencil className="size-4" />
                </button>
                <DeleteButton what={`«${o.name}» con tutti i suoi ruoli e membri`} disabled={pending} onConfirm={() => execute(() => deleteOrg(kind, o.id))} />
              </div>
              {open === o.id && <OrgDetail kind={kind} org={o} characters={characters} />}
            </li>
          ),
        )}
        {orgs.length === 0 && <li className="text-sm text-muted-foreground">Nessun {label.one}: creane uno.</li>}
      </ul>
    </div>
  );
}

function OrgForm({ kind, org, onDone }: { kind: OrgKind; org?: Org; onDone: () => void }) {
  const [form, setForm] = useState<OrgInput>({
    id: org?.id,
    name: org?.name ?? "",
    description: org?.description ?? "",
    jobKind: org?.kind ?? "part_time",
    active: org?.active ?? true,
  });
  const { pending, error, execute } = useAdminAction();
  const label = ORG_LABELS[kind];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveOrg(kind, form), onDone);
      }}
      className="glass flex flex-col gap-3 rounded-2xl border-flamingo/40 p-4"
    >
      <p className="font-heading text-xl tracking-wide text-peach">{org ? `Modifica ${org.name}` : `Nuovo ${label.one}`}</p>
      <ErrorText error={error} />
      <div className={cn("grid gap-3", kind === "job" && "sm:grid-cols-[1fr_10rem]")}>
        <FieldLabel label="Nome">
          <input className={inputClass} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FieldLabel>
        {kind === "job" && (
          <FieldLabel label="Tipo">
            <select className={inputClass} value={form.jobKind} onChange={(e) => setForm({ ...form, jobKind: e.target.value as JobKind })}>
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
            </select>
          </FieldLabel>
        )}
      </div>
      <FieldLabel label="Descrizione" hint="La vedono i giocatori in Utility">
        <textarea className={cn(textareaClass, "min-h-28")} value={form.description} maxLength={4000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FieldLabel>
      <ActiveToggle checked={form.active} onChange={(active) => setForm({ ...form, active })} label={form.active ? "Attivo (visibile e con stipendio)" : "Disattivato (nascosto, niente stipendio)"} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Annulla
        </Button>
        <Button type="submit" disabled={pending} className="rounded-full px-6">
          {pending ? "Salvataggio…" : "Salva"}
        </Button>
      </div>
    </form>
  );
}

function OrgDetail({ kind, org, characters }: { kind: OrgKind; org: Org; characters: CharacterOption[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { pending, error, execute } = useAdminAction();
  const roleName = (id: string) => org.roles.find((r) => r.id === id)?.name ?? "?";

  return (
    <div className="flex flex-col gap-5 border-t border-white/10 p-4">
      {org.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{org.description}</p>}
      <ErrorText error={error} />

      {/* Ruoli */}
      <section className="flex flex-col gap-2">
        <p className="font-medium">Ruoli</p>
        <ul className="flex flex-col gap-2">
          {org.roles.map((r, i) =>
            editing === r.id ? (
              <li key={r.id}>
                <RoleForm kind={kind} orgId={org.id} role={r} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={r.id} className="flex items-center gap-2 rounded-xl bg-white/5 p-2">
                <MoveButtons first={i === 0} last={i === org.roles.length - 1} disabled={pending} onMove={(d) => execute(() => moveOrgItem(kind, r.id, d, org.id))} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{r.name}</span>{" "}
                  <span className="text-xs text-sand">{r.salary > 0 ? formatDollars(r.salary) : "senza stipendio"}</span>
                  {kind === "job" && <span className="text-xs text-muted-foreground"> · {r.self_select ? "a scelta del giocatore" : "assegnato dallo staff"}</span>}
                  {r.description && <span className="block line-clamp-1 text-xs text-muted-foreground">{r.description}</span>}
                </span>
                <button type="button" onClick={() => setEditing(r.id)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label={`Modifica ${r.name}`}>
                  <Pencil className="size-4" />
                </button>
                <DeleteButton what={`il ruolo «${r.name}» (chi lo ha lo perde)`} disabled={pending} onConfirm={() => execute(() => deleteOrgRole(kind, r.id))} />
              </li>
            ),
          )}
        </ul>
        {editing === "new" ? (
          <RoleForm kind={kind} orgId={org.id} onDone={() => setEditing(null)} />
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing("new")} className="w-fit">
            <Plus /> Nuovo ruolo
          </Button>
        )}
      </section>

      {/* Membri */}
      <section className="flex flex-col gap-2">
        <p className="font-medium">Membri</p>
        <ul className="flex flex-col gap-1">
          {org.members.map((m) => (
            <li key={m.character_id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-2 text-sm">
              <span className="min-w-32 flex-1 font-medium">{m.name}</span>
              <select
                className={cn(inputClass, "h-8 w-auto")}
                value={m.role_id}
                disabled={pending}
                aria-label={`Ruolo di ${m.name}`}
                onChange={(e) => execute(() => assignMember(kind, org.id, m.character_id, e.target.value))}
              >
                {org.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pending}
                onClick={() => window.confirm(`Togliere ${m.name} (${roleName(m.role_id)}) da ${org.name}?`) && execute(() => removeMember(kind, org.id, m.character_id))}
                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                aria-label={`Togli ${m.name}`}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
          {org.members.length === 0 && <li className="text-sm text-muted-foreground">Nessun membro.</li>}
        </ul>
        {org.roles.length > 0 ? (
          <AddMember kind={kind} org={org} characters={characters.filter((c) => !org.members.some((m) => m.character_id === c.id))} />
        ) : (
          <p className="text-xs text-muted-foreground">Crea almeno un ruolo per assegnare i personaggi.</p>
        )}
      </section>
    </div>
  );
}

function RoleForm({ kind, orgId, role, onDone }: { kind: OrgKind; orgId: string; role?: OrgRole; onDone: () => void }) {
  const [form, setForm] = useState<RoleInput>({
    id: role?.id,
    parentId: orgId,
    name: role?.name ?? "",
    description: role?.description ?? "",
    salary: role?.salary ?? 0,
    selfSelect: role?.self_select ?? true,
  });
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => saveOrgRole(kind, form), onDone);
      }}
      className="flex flex-col gap-3 rounded-xl border border-flamingo/40 bg-night/30 p-3"
    >
      <ErrorText error={error} />
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <FieldLabel label="Nome del ruolo">
          <input className={inputClass} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FieldLabel>
        <FieldLabel label="Stipendio in $" hint="0 = nessuno">
          <input className={inputClass} type="number" min={0} max={1000000} value={form.salary} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} />
        </FieldLabel>
      </div>
      <FieldLabel label="Descrizione del ruolo">
        <textarea className={textareaClass} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </FieldLabel>
      {kind === "job" && (
        <ActiveToggle
          checked={form.selfSelect}
          onChange={(selfSelect) => setForm({ ...form, selfSelect })}
          label={form.selfSelect ? "Il giocatore può sceglierlo da solo" : "Lo assegna solo lo staff"}
        />
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Annulla
        </Button>
        <Button type="submit" size="sm" disabled={pending} className="rounded-full px-5">
          {pending ? "Salvataggio…" : "Salva ruolo"}
        </Button>
      </div>
    </form>
  );
}

function AddMember({ kind, org, characters }: { kind: OrgKind; org: Org; characters: CharacterOption[] }) {
  const [characterId, setCharacterId] = useState("");
  const [roleId, setRoleId] = useState(org.roles[0]?.id ?? "");
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => assignMember(kind, org.id, characterId, roleId), () => setCharacterId(""));
      }}
      className="flex flex-col gap-2"
    >
      <ErrorText error={error} />
      <div className="flex flex-wrap gap-2">
        <select className={cn(inputClass, "min-w-40 flex-1")} value={characterId} onChange={(e) => setCharacterId(e.target.value)} aria-label="Personaggio">
          <option value="">Scegli un personaggio approvato…</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className={cn(inputClass, "w-auto")} value={roleId} onChange={(e) => setRoleId(e.target.value)} aria-label="Ruolo">
          {org.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={pending || !characterId || !roleId} className="rounded-full">
          <UserPlus /> Assegna
        </Button>
      </div>
    </form>
  );
}
