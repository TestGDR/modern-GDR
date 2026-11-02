"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, Pencil, Plus, Trophy, UserPlus, X } from "lucide-react";
import { ActiveToggle, DeleteButton, ErrorText, FieldLabel, MoveButtons, StatusPill, inputClass, textareaClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { SafeHtml, plainToHtml } from "@/components/guide/safe-html";
import { SortableList } from "@/components/sortable-list";
import {
  assignMember,
  deleteGroupCategory,
  deleteOrg,
  deleteOrgRole,
  moveOrgItem,
  removeMember,
  reorderGroupCategories,
  saveGroupCategory,
  saveOrg,
  saveOrgRole,
  type OrgInput,
  type RoleInput,
} from "@/lib/actions/orgs";
import { formatDollars } from "@/lib/bank";
import { ORG_LABELS, type GroupCategory, type JobKind, type Org, type OrgKind, type OrgRole } from "@/lib/orgs";
import { cn } from "@/lib/utils";

// L'editor (TipTap) si carica solo quando serve
const RichEditor = dynamic(() => import("@/components/guide/rich-editor").then((m) => m.RichEditor), {
  ssr: false,
  loading: () => <p className="text-xs text-muted-foreground">Caricamento dell&apos;editor…</p>,
});

type CharacterOption = { id: string; name: string };
type Props = { kind: OrgKind; orgs: Org[]; characters: CharacterOption[]; categories?: GroupCategory[] };

/** Gestione → Lavori / Gruppi: crea, modifica, ruoli e assegnazioni */
export function OrgsManager({ kind, orgs, characters, categories = [] }: Props) {
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
        <OrgForm kind={kind} categories={categories} onDone={() => setEditing(null)} />
      ) : (
        <Button type="button" onClick={() => setEditing("new")} className="w-fit rounded-full">
          <Plus /> Nuovo {label.one}
        </Button>
      )}
      <ul className="flex flex-col gap-2">
        {orgs.map((o, i) =>
          editing === o.id ? (
            <li key={o.id}>
              <OrgForm kind={kind} org={o} categories={categories} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={o.id} className="glass rounded-2xl">
              <div className="flex items-center gap-2 p-3">
                <MoveButtons first={i === 0} last={i === orgs.length - 1} disabled={pending} onMove={(d) => execute(() => moveOrgItem(kind, o.id, d))} />
                <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{o.name}</span>
                      {kind === "group" && (
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] text-lavender">
                          {categories.find((c) => c.id === o.category_id)?.name ?? "Senza ambito"}
                        </span>
                      )}
                      <StatusPill active={o.active} />
                      {o.hidden && <span className="rounded-full bg-night/60 px-2 py-0.5 text-[0.7rem] text-orchid">Nascosto</span>}
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

function OrgForm({ kind, org, categories, onDone }: { kind: OrgKind; org?: Org; categories: GroupCategory[]; onDone: () => void }) {
  const [form, setForm] = useState<OrgInput>({
    id: org?.id,
    name: org?.name ?? "",
    description: plainToHtml(org?.description ?? ""),
    iconUrl: org?.icon_url ?? "",
    active: org?.active ?? true,
    tags: org?.tags ?? [],
    categoryId: org ? org.category_id : (categories.find((c) => !c.for_sport)?.id ?? null),
    hidden: org?.hidden ?? false,
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
      <div className={cn("grid gap-3", kind === "group" && "sm:grid-cols-[1fr_12rem]")}>
        <FieldLabel label="Nome">
          <input className={inputClass} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FieldLabel>
        {kind === "group" && (
          <FieldLabel label="Ambito" hint="La scheda di Utility → Gruppi">
            <select className={inputClass} value={form.categoryId ?? ""} onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}>
              <option value="">Senza ambito</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FieldLabel>
        )}
      </div>
      <FieldLabel label="Icona" hint="Link a un'immagine (https://…), circa 30x30: compare accanto al nome in Utility e nelle schede">
        <span className="flex items-center gap-2">
          {form.iconUrl?.startsWith("https://") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.iconUrl} alt="" className="size-[30px] shrink-0 rounded object-contain" />
          )}
          <input className={inputClass} value={form.iconUrl ?? ""} maxLength={500} placeholder="https://…" onChange={(e) => setForm({ ...form, iconUrl: e.target.value })} />
        </span>
      </FieldLabel>
      {/* niente <label> intorno all'editor: il clic nel testo premerebbe il primo pulsante (Grassetto) */}
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Descrizione</span>
        <RichEditor value={form.description} onChange={(description) => setForm({ ...form, description })} minHeight="min-h-48" />
        <span className="text-xs text-muted-foreground">La vedono i giocatori in Utility, nella pagina del lavoro o del gruppo</span>
      </div>
      {kind === "group" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={(form.tags ?? []).includes("malavita")}
            onChange={(e) => setForm({ ...form, tags: e.target.checked ? ["malavita"] : [] })}
          />
          Malavita: i membri vedono il mercato nero (Utility → Mercato)
        </label>
      )}
      {kind === "group" && !org?.sport && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={!!form.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })} />
          <span>
            Nascosto: niente icona nella scheda né negli online, niente pagina in Utility → Gruppi.
            <span className="block text-xs text-muted-foreground">Lo vedono solo i suoi membri e lo staff (qui, con tutti i membri). Mercato nero, forum riservati e stipendi funzionano lo stesso.</span>
          </span>
        </label>
      )}
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
      {org.description && <SafeHtml html={org.description} className="text-sm text-muted-foreground" />}
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
                  <span className="text-xs text-sand">{payText(kind, r)}</span>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {r.max_members ? `${org.members.filter((m) => m.role_id === r.id).length}/${r.max_members} posti` : "posti illimitati"}
                  </span>
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
              {kind === "job" && (
                <select
                  className={cn(inputClass, "h-8 w-auto")}
                  value={m.mode ?? "part_time"}
                  disabled={pending}
                  aria-label={`Orario di ${m.name}`}
                  onChange={(e) => execute(() => assignMember(kind, org.id, m.character_id, m.role_id, e.target.value as JobKind))}
                >
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                </select>
              )}
              <select
                className={cn(inputClass, "h-8 w-auto")}
                value={m.role_id}
                disabled={pending}
                aria-label={`Ruolo di ${m.name}`}
                onChange={(e) => execute(() => assignMember(kind, org.id, m.character_id, e.target.value, defaultMode(org.roles.find((r) => r.id === e.target.value), m.mode)))}
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
    salaryFull: role ? role.salary_full : null,
    salaryPart: role ? role.salary_part : 900,
    maxMembers: role?.max_members ?? null,
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
      <div className={cn("grid gap-3", kind === "job" ? "sm:grid-cols-[1fr_8rem_8rem_7rem]" : "sm:grid-cols-[1fr_9rem_7rem]")}>
        <FieldLabel label="Nome del ruolo">
          <input className={inputClass} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FieldLabel>
        {kind === "job" ? (
          <>
            <FieldLabel label="Full time $/mese" hint="Vuoto = no">
              <input className={inputClass} type="number" min={0} max={1000000} value={form.salaryFull ?? ""} placeholder="—" onChange={(e) => setForm({ ...form, salaryFull: numOrNull(e.target.value) })} />
            </FieldLabel>
            <FieldLabel label="Part time $/mese" hint="Vuoto = no">
              <input className={inputClass} type="number" min={0} max={1000000} value={form.salaryPart ?? ""} placeholder="—" onChange={(e) => setForm({ ...form, salaryPart: numOrNull(e.target.value) })} />
            </FieldLabel>
          </>
        ) : (
          <FieldLabel label="Stipendio in $" hint="0 = nessuno">
            <input className={inputClass} type="number" min={0} max={1000000} value={form.salary} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} />
          </FieldLabel>
        )}
        <FieldLabel label="Posti" hint="Vuoto = illimitati">
          <input className={inputClass} type="number" min={1} max={1000} value={form.maxMembers ?? ""} placeholder="∞" onChange={(e) => setForm({ ...form, maxMembers: numOrNull(e.target.value) })} />
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
  const [mode, setMode] = useState<JobKind>(() => defaultMode(org.roles[0]));
  const role = org.roles.find((r) => r.id === roleId);
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(() => assignMember(kind, org.id, characterId, roleId, kind === "job" ? mode : undefined), () => setCharacterId(""));
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
        <select
          className={cn(inputClass, "w-auto")}
          value={roleId}
          onChange={(e) => {
            setRoleId(e.target.value);
            setMode(defaultMode(org.roles.find((r) => r.id === e.target.value), mode));
          }}
          aria-label="Ruolo"
        >
          {org.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {kind === "job" && (
          <select className={cn(inputClass, "w-auto")} value={mode} onChange={(e) => setMode(e.target.value as JobKind)} aria-label="Orario">
            <option value="full_time" disabled={role?.salary_full === null}>
              Full time
            </option>
            <option value="part_time" disabled={role?.salary_part === null}>
              Part time
            </option>
          </select>
        )}
        <Button type="submit" disabled={pending || !characterId || !roleId} className="rounded-full">
          <UserPlus /> Assegna
        </Button>
      </div>
    </form>
  );
}

/** Ambiti dei gruppi: ognuno è una scheda in Utility → Gruppi */
export function GroupCategoriesEditor({ categories }: { categories: GroupCategory[] }) {
  const { pending, error, execute } = useAdminAction();
  const [name, setName] = useState("");
  return (
    <section className="glass flex flex-col gap-2 rounded-2xl p-4">
      <p className="font-heading text-xl tracking-wide text-peach">Ambiti</p>
      <p className="text-xs text-muted-foreground">
        Ogni ambito è una scheda in Utility → Gruppi. Trascina la maniglia ⋮⋮ per cambiare l&apos;ordine; la coppa indica l&apos;ambito dove finiscono da sole le squadre
        sportive (Gestione → Sport). «Max» è quanti gruppi di quell&apos;ambito può avere un personaggio (vuoto = senza limite). Eliminando un ambito i suoi gruppi restano,
        «senza ambito».
      </p>
      <ErrorText error={error} />
      <SortableList
        className="flex flex-col gap-1"
        items={categories}
        disabled={pending}
        onReorder={(ids) => execute(() => reorderGroupCategories(ids))}
        renderItem={(c, handle) => <CategoryRow category={c} handle={handle} />}
      />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          execute(() => saveGroupCategory({ name, forSport: false }), () => setName(""));
        }}
      >
        <input className={inputClass} value={name} maxLength={40} placeholder="Nuovo ambito (es. Confraternite)" onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="sm" disabled={pending || name.trim().length < 2} className="rounded-full">
          <Plus /> Aggiungi
        </Button>
      </form>
    </section>
  );
}

function CategoryRow({ category, handle }: { category: GroupCategory; handle: React.ReactNode }) {
  const { pending, error, execute } = useAdminAction();
  const [name, setName] = useState(category.name);
  const save = (patch: { name?: string; forSport?: boolean; maxPerCharacter?: number | null }) =>
    execute(() =>
      saveGroupCategory({
        id: category.id,
        name: patch.name ?? category.name,
        forSport: patch.forSport ?? category.for_sport,
        maxPerCharacter: patch.maxPerCharacter === undefined ? category.max_per_character : patch.maxPerCharacter,
      }),
    );
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-1.5">
      <div className="flex items-center gap-2">
        {handle}
        <input
          className={cn(inputClass, "h-8")}
          value={name}
          maxLength={40}
          aria-label="Nome dell'ambito"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== category.name && name.trim().length >= 2 && save({ name })}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => save({ forSport: !category.for_sport })}
          className={cn("grid size-8 shrink-0 place-items-center rounded-lg hover:bg-white/10", category.for_sport ? "text-sand" : "text-white/25")}
          aria-pressed={category.for_sport}
          aria-label={category.for_sport ? "Qui finiscono le squadre sportive" : "Metti qui le squadre sportive"}
          title={category.for_sport ? "Qui finiscono le squadre sportive" : "Metti qui le squadre sportive"}
        >
          <Trophy className="size-4" />
        </button>
        {!category.for_sport && (
          <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Quanti gruppi di questo ambito può avere un personaggio (vuoto = senza limite)">
            Max
            <input
              type="number"
              min={1}
              max={20}
              defaultValue={category.max_per_character ?? ""}
              placeholder="∞"
              aria-label={`Massimo di gruppi «${category.name}» per personaggio`}
              className={cn(inputClass, "h-8 w-14 px-1.5")}
              onBlur={(e) => {
                const v = e.target.value.trim() === "" ? null : Math.round(Number(e.target.value));
                if (v !== category.max_per_character) save({ maxPerCharacter: v });
              }}
            />
          </label>
        )}
        <DeleteButton what={`l'ambito «${category.name}»`} disabled={pending} onConfirm={() => execute(() => deleteGroupCategory(category.id))} />
      </div>
      <ErrorText error={error} />
    </div>
  );
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v) || 0)));

/** "FT 2.400 $ · PT 1.000 $" (lavori) o lo stipendio del gruppo */
function payText(kind: OrgKind, r: OrgRole) {
  if (kind === "group") return r.salary > 0 ? formatDollars(r.salary) : "senza stipendio";
  return [r.salary_full !== null && `FT ${formatDollars(r.salary_full)}`, r.salary_part !== null && `PT ${formatDollars(r.salary_part)}`].filter(Boolean).join(" · ");
}

/** Orario per un ruolo: quello di prima se il ruolo lo prevede, altrimenti quello disponibile */
function defaultMode(role: OrgRole | undefined, current?: JobKind | null): JobKind {
  if (current === "full_time" && role?.salary_full !== null) return "full_time";
  if (current === "part_time" && role?.salary_part !== null) return "part_time";
  return role?.salary_part !== null ? "part_time" : "full_time";
}

/**
 * Assegna ruolo: lo staff sceglie un personaggio e vede tutti i suoi lavori o gruppi;
 * può dargli un ruolo di qualsiasi lavoro/gruppo, cambiarlo o toglierlo (licenziarlo).
 */
export function AssignPanel({ kind, orgs, characters }: { kind: OrgKind; orgs: Org[]; characters: CharacterOption[] }) {
  const [characterId, setCharacterId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [mode, setMode] = useState<JobKind>("part_time");
  const { pending, error, execute } = useAdminAction();
  const one = ORG_LABELS[kind].one;
  const character = characters.find((c) => c.id === characterId);
  const mine = orgs.filter((o) => o.members.some((m) => m.character_id === characterId));
  const org = orgs.find((o) => o.id === orgId);
  const role = org?.roles.find((r) => r.id === roleId);
  const taken = (o: Org, r: OrgRole) => o.members.filter((m) => m.role_id === r.id && m.character_id !== characterId).length;
  const isFull = (o: Org, r: OrgRole) => r.max_members !== null && taken(o, r) >= r.max_members;

  function pickRole(id: string) {
    setRoleId(id);
    setMode(defaultMode(org?.roles.find((r) => r.id === id), mode));
  }

  return (
    <section className="glass flex flex-col gap-3 rounded-2xl p-4">
      <p className="flex items-center gap-2 font-heading text-xl tracking-wide text-peach">
        <UserPlus className="size-5" /> Assegna ruolo
      </p>
      <p className="text-xs text-muted-foreground">
        Scegli un personaggio: vedi i suoi {kind === "job" ? "lavori" : "gruppi"}, puoi dargli un ruolo di qualsiasi {one}, cambiarlo o toglierlo. I ruoli al completo non si
        possono assegnare{kind === "job" ? "; restano le regole dei lavori (al massimo due, mai due full time)" : "; resta il massimo dei gruppi per personaggio"}.
      </p>
      <select className={inputClass} value={characterId} onChange={(e) => setCharacterId(e.target.value)} aria-label="Personaggio">
        <option value="">Scegli un personaggio approvato…</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <ErrorText error={error} />

      {character && (
        <>
          <ul className="flex flex-col gap-1">
            {mine.length === 0 && <li className="text-sm text-muted-foreground">Nessun {one}.</li>}
            {mine.map((o) => {
              const m = o.members.find((x) => x.character_id === characterId)!;
              const current = o.roles.find((r) => r.id === m.role_id);
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-2 text-sm">
                  <span className="min-w-32 flex-1 font-medium">{o.name}</span>
                  <select
                    className={cn(inputClass, "h-8 w-auto")}
                    value={m.role_id}
                    disabled={pending}
                    aria-label={`Ruolo in ${o.name}`}
                    onChange={(e) =>
                      execute(() =>
                        assignMember(kind, o.id, characterId, e.target.value, kind === "job" ? defaultMode(o.roles.find((r) => r.id === e.target.value), m.mode) : undefined),
                      )
                    }
                  >
                    {o.roles.map((r) => (
                      <option key={r.id} value={r.id} disabled={r.id !== m.role_id && isFull(o, r)}>
                        {r.name}
                        {r.id !== m.role_id && isFull(o, r) ? " (al completo)" : ""}
                      </option>
                    ))}
                  </select>
                  {kind === "job" && (
                    <select
                      className={cn(inputClass, "h-8 w-auto")}
                      value={m.mode ?? "part_time"}
                      disabled={pending}
                      aria-label={`Orario in ${o.name}`}
                      onChange={(e) => execute(() => assignMember(kind, o.id, characterId, m.role_id, e.target.value as JobKind))}
                    >
                      <option value="full_time" disabled={current?.salary_full === null}>
                        Full time
                      </option>
                      <option value="part_time" disabled={current?.salary_part === null}>
                        Part time
                      </option>
                    </select>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    className="text-destructive"
                    onClick={() =>
                      window.confirm(`${kind === "job" ? "Licenziare" : "Togliere"} ${character.name} da ${o.name}?`) && execute(() => removeMember(kind, o.id, characterId))
                    }
                  >
                    <X /> {kind === "job" ? "Licenzia" : "Togli"}
                  </Button>
                </li>
              );
            })}
          </ul>

          <form
            className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              execute(
                () => assignMember(kind, orgId, characterId, roleId, kind === "job" ? mode : undefined),
                () => {
                  setOrgId("");
                  setRoleId("");
                },
              );
            }}
          >
            <select
              className={cn(inputClass, "w-auto min-w-40 flex-1")}
              value={orgId}
              onChange={(e) => {
                setOrgId(e.target.value);
                setRoleId("");
              }}
              aria-label={kind === "job" ? "Lavoro" : "Gruppo"}
            >
              <option value="">{kind === "job" ? "Lavoro…" : "Gruppo…"}</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.active ? "" : " (disattivato)"}
                </option>
              ))}
            </select>
            <select className={cn(inputClass, "w-auto min-w-40 flex-1")} value={roleId} disabled={!org} onChange={(e) => pickRole(e.target.value)} aria-label="Ruolo">
              <option value="">Ruolo…</option>
              {org?.roles.map((r) => (
                <option key={r.id} value={r.id} disabled={isFull(org, r)}>
                  {r.name}
                  {r.max_members !== null ? ` (${taken(org, r)}/${r.max_members})` : ""}
                  {isFull(org, r) ? " · al completo" : ""}
                </option>
              ))}
            </select>
            {kind === "job" && (
              <select className={cn(inputClass, "w-auto")} value={mode} onChange={(e) => setMode(e.target.value as JobKind)} aria-label="Orario">
                <option value="full_time" disabled={role?.salary_full === null}>
                  Full time
                </option>
                <option value="part_time" disabled={role?.salary_part === null}>
                  Part time
                </option>
              </select>
            )}
            <Button type="submit" disabled={pending || !orgId || !roleId} className="rounded-full">
              <UserPlus /> Assegna
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

/** Schede del pannello (es. Gestione → Gruppi: Ambiti, Gruppi, Assegna ruolo) */
export function PanelTabs({ tabs, initial = 0 }: { tabs: { label: string; content: React.ReactNode }[]; initial?: number }) {
  const [tab, setTab] = useState(initial);
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-1 border-b border-white/10" role="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={tab === i}
            onClick={() => setTab(i)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 font-heading text-xl tracking-wide transition-colors",
              tab === i ? "border-flamingo text-peach" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div role="tabpanel">{tabs[tab]?.content}</div>
    </div>
  );
}
