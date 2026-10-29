"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Backpack,
  BookOpen,
  Eye,
  Fingerprint,
  Gauge,
  Heart,
  IdCard,
  KeyRound,
  MapPin,
  Pencil,
  ScanFace,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  UserRoundPlus,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { FormMessage } from "@/components/auth/auth-forms";
import { AdminSheetPanel } from "@/components/game/admin-sheet";
import { useCloseModal } from "@/components/game/page-modal";
import { PrefsPanel } from "@/components/game/prefs-panel";
import { Palm } from "@/components/scenery/palm";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCharacter } from "@/lib/actions/character";
import { reviewCharacter, startCharacter } from "@/lib/actions/creation";
import type { CharacterBuild, RulesData } from "@/lib/data";
import { formatBirthDate } from "@/lib/interlock";
import { initials } from "@/lib/format";
import type { Character, District, FormState } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SheetCharacter = Character & {
  district: Pick<District, "name" | "gradient"> | null;
};

type TextField = "known_facts" | "relationships" | "skills" | "traits" | "appearance" | "bio" | "equipment";

type Section = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Campo di testo libero mostrato nella sezione */
  field?: TextField;
  /** Suggerimento per chi scrive la sezione */
  hint?: string;
};

const SECTIONS: Section[] = [
  { key: "principale", label: "Principale", icon: Sparkles },
  { key: "dati", label: "Dati", icon: IdCard },
  { key: "si-sa-che", label: "Si sa che", icon: Eye, field: "known_facts", hint: "Voci, fatti noti, reputazione: ciò che a Miami si dice di lui o di lei." },
  { key: "affetti", label: "Affetti", icon: Heart, field: "relationships", hint: "Famiglia, amici, amori, nemici." },
  { key: "caratteristiche", label: "Caratteristiche", icon: Gauge },
  { key: "abilita", label: "Abilità", icon: Zap },
  { key: "tratti", label: "Tratti", icon: Fingerprint, field: "traits", hint: "Carattere: personalità, abitudini, pregi e difetti." },
  { key: "aspetto", label: "Aspetto", icon: ScanFace, field: "appearance", hint: "Com'è fisicamente, come si veste, segni particolari." },
  { key: "storia", label: "Storia", icon: BookOpen, field: "bio", hint: "Da dove viene e cosa l'ha portato a Miami." },
  { key: "equipaggiamento", label: "Equipaggiamento", icon: Backpack, field: "equipment", hint: "Cosa porta con sé: auto, telefono, oggetti." },
];

type View = { section: string; mode: "view" | "edit" | "settings" | "admin" };

type CharacterSheetWindowProps = {
  character: SheetCharacter;
  isOwner: boolean;
  online: boolean;
  /** Data di arrivo già formattata */
  since: string;
  /** Solo per il proprietario: i quartieri per la modifica */
  districts?: District[];
  /** "page" = pagina /scheda, "modal" = dentro la finestra trascinabile */
  variant?: SheetVariant;
  /** Valori Interlock del personaggio e regole del sistema */
  build: CharacterBuild;
  rules: RulesData;
  /** Chi può approvare vede i pulsanti Approva/Rifiuta sulle schede in attesa */
  canReview?: boolean;
  /** Amministratore: sblocca, resetta e modifica tutta la scheda */
  isAdmin?: boolean;
};

/** Scheda del personaggio a sezioni, nello stile "finestra" del gioco */
export function CharacterSheetWindow({
  character,
  isOwner,
  online,
  since,
  districts = [],
  variant = "page",
  build,
  rules,
  canReview = false,
  isAdmin = false,
}: CharacterSheetWindowProps) {
  const [view, setView] = useState<View>({ section: "principale", mode: "view" });
  const section = SECTIONS.find((s) => s.key === view.section) ?? SECTIONS[0];
  const canEdit = isOwner && section.key !== "caratteristiche" && section.key !== "abilita";

  const open = (key: string) => setView({ section: key, mode: "view" });

  return (
    <SheetFrame title={`Scheda · ${character.name}`} variant={variant}>
      <StatusBanner character={character} canReview={canReview} />
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto @2xl:grid-cols-[16rem_minmax(0,1fr)] @2xl:overflow-hidden">
        {/* Colonna sinistra: ritratto, quartiere, sezioni */}
        <aside className="flex flex-col border-white/10 @2xl:min-h-0 @2xl:border-r">
          <div className="flex items-end gap-3 p-4 @2xl:pb-3">
            <Portrait character={character} online={online} />
            <DistrictBanner district={character.district} />
          </div>

          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 @2xl:flex-1 @2xl:flex-col @2xl:overflow-y-auto @2xl:px-0 @2xl:pb-0" aria-label="Sezioni della scheda">
            {SECTIONS.map(({ key, label, icon: Icon }) => {
              const active = view.section === key && view.mode !== "settings";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => open(key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium tracking-wide whitespace-nowrap uppercase transition-colors @2xl:rounded-none @2xl:border-b @2xl:border-white/5 @2xl:px-5 @2xl:py-2.5",
                    active
                      ? "bg-gradient-to-r from-flamingo/35 to-flamingo/5 text-white shadow-[inset_3px_0_0_var(--flamingo)]"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-peach" : "text-lavender/70")} />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Pulsanti in fondo */}
          <div className="hidden justify-center gap-3 border-t border-white/10 p-4 @2xl:flex">
            {isAdmin && (
              <IconButton label="Amministrazione della scheda" active={view.mode === "admin"} onClick={() => setView((v) => ({ ...v, mode: v.mode === "admin" ? "view" : "admin" }))}>
                <ShieldAlert />
              </IconButton>
            )}
            {isOwner ? (
              <>
                <IconButton label="Impostazioni" active={view.mode === "settings"} onClick={() => setView((v) => ({ ...v, mode: "settings" }))}>
                  <Settings />
                </IconButton>
                <IconButton
                  label={canEdit ? `Modifica ${section.label}` : "Le caratteristiche le modifica lo staff"}
                  active={view.mode === "edit"}
                  disabled={!canEdit}
                  onClick={() => setView((v) => ({ ...v, mode: v.mode === "edit" ? "view" : "edit" }))}
                >
                  <Pencil />
                </IconButton>
              </>
            ) : (
              <Link href={`/messaggi?a=${character.owner_id}`} className={cn(buttonVariants({ variant: "outline" }), "rounded-full")} title="Messaggio OFF al giocatore">
                <Send /> Scrivi OFF
              </Link>
            )}
          </div>
        </aside>

        {/* Contenuto della sezione */}
        <section className="relative min-h-[24rem] overflow-y-auto">
          {/* Su mobile i pulsanti stanno in alto a destra */}
          <div className="absolute top-3 right-3 z-10 flex gap-2">
            {isAdmin && view.mode !== "admin" && (
              <span className="@2xl:hidden">
                <IconButton label="Amministrazione della scheda" onClick={() => setView((v) => ({ ...v, mode: "admin" }))}>
                  <ShieldAlert />
                </IconButton>
              </span>
            )}
            {isOwner && canEdit && view.mode !== "edit" && (
              <IconButton label={`Modifica ${section.label}`} onClick={() => setView((v) => ({ ...v, mode: "edit" }))}>
                <Pencil />
              </IconButton>
            )}
            {isOwner && view.mode !== "settings" && (
              <span className="@2xl:hidden">
                <IconButton label="Impostazioni" onClick={() => setView((v) => ({ ...v, mode: "settings" }))}>
                  <Settings />
                </IconButton>
              </span>
            )}
            {!isOwner && (
              <Link href={`/messaggi?a=${character.owner_id}`} className={cn(buttonVariants({ size: "sm" }), "rounded-full @2xl:hidden")} title="Messaggio OFF al giocatore">
                <Send /> Scrivi OFF
              </Link>
            )}
          </div>

          {view.mode === "admin" && isAdmin ? (
            <AdminSheetPanel character={character} build={build} rules={rules} districts={districts} onClose={() => setView((v) => ({ ...v, mode: "view" }))} />
          ) : view.mode === "settings" ? (
            <SettingsPanel name={character.name} onClose={() => setView((v) => ({ ...v, mode: "view" }))} />
          ) : view.mode === "edit" ? (
            <SectionEditor
              key={section.key}
              section={section}
              character={character}
              districts={districts}
              onDone={() => setView((v) => ({ ...v, mode: "view" }))}
            />
          ) : section.key === "principale" ? (
            <MainSection character={character} />
          ) : section.key === "dati" ? (
            <SectionFrame title="Dati">
              <DataList character={character} online={online} since={since} rules={rules} />
            </SectionFrame>
          ) : section.key === "caratteristiche" ? (
            <SectionFrame title="Caratteristiche">
              <StatBars build={build} rules={rules} />
              <p className="mt-6 text-xs text-muted-foreground">Le caratteristiche non cambiano dopo l&apos;approvazione.</p>
            </SectionFrame>
          ) : section.key === "abilita" ? (
            <SectionFrame title="Abilità">
              <SkillList build={build} rules={rules} />
            </SectionFrame>
          ) : section.key === "tratti" ? (
            <SectionFrame title="Tratti">
              <ChosenOptions build={build} rules={rules} />
              <h3 className="mt-6 mb-2 font-heading text-xl tracking-wide text-peach">Carattere</h3>
              <FreeText text={character.traits} isOwner={isOwner} />
            </SectionFrame>
          ) : (
            <SectionFrame title={section.label}>
              <FreeText text={section.field ? character[section.field] : null} isOwner={isOwner} />
            </SectionFrame>
          )}
        </section>
      </div>
    </SheetFrame>
  );
}

/* ----------------------------- Elementi ----------------------------- */

function IconButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "grid size-10 place-items-center rounded-xl border border-white/15 bg-night/60 text-white/80 backdrop-blur transition-colors hover:border-flamingo/60 hover:text-white disabled:opacity-40 [&_svg]:size-4",
        active && "border-flamingo bg-flamingo/20 text-white",
      )}
    >
      {children}
    </button>
  );
}

function Portrait({ character, online }: { character: SheetCharacter; online: boolean }) {
  return (
    <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl border border-peach/40 bg-gradient-to-br from-violet via-orchid to-peach shadow-lg">
      {character.avatar_url ? (
        // Immagini esterne inserite dal giocatore: niente ottimizzazione di Next
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character.avatar_url} alt={`Ritratto di ${character.name}`} className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center font-heading text-4xl tracking-wider text-white">{initials(character.name)}</span>
      )}
      <span
        className={cn("absolute right-1.5 bottom-1.5 size-3 rounded-full ring-2 ring-night", online ? "bg-mint" : "bg-white/40")}
        aria-label={online ? "Online" : "Offline"}
      />
    </div>
  );
}

/** "Cartolina" del quartiere, al posto dello stendardo */
function DistrictBanner({ district }: { district: SheetCharacter["district"] }) {
  return (
    <div
      className={cn(
        "relative flex h-24 w-16 shrink-0 flex-col items-center justify-end overflow-hidden rounded-b-2xl rounded-t-md border border-white/15 bg-gradient-to-b pb-2 shadow-lg",
        district?.gradient ?? "from-dusk via-violet to-lavender",
      )}
      title={district ? `Quartiere: ${district.name}` : "Nessun quartiere"}
    >
      <Palm className="absolute -bottom-1 left-1/2 h-16 -translate-x-1/2 text-palm/80" lean={8} />
      <MapPin className="relative size-4 text-white drop-shadow" />
      <span className="relative mt-0.5 px-1 text-center font-heading text-[0.65rem] leading-tight tracking-wider text-white drop-shadow">
        {district?.name ?? "Miami"}
      </span>
    </div>
  );
}

function MainSection({ character }: { character: SheetCharacter }) {
  const subtitle = [character.occupation, character.district?.name].filter(Boolean).join(" · ");
  return (
    <div className="relative flex h-full min-h-[24rem] flex-col justify-end overflow-hidden">
      {character.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character.cover_url} alt={`Immagine di ${character.name}`} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className={cn("absolute inset-0 bg-gradient-to-b", character.district?.gradient ?? "from-violet via-flamingo to-peach")}>
          <div className="absolute bottom-[22%] left-1/2 size-40 -translate-x-1/2 rounded-full bg-sand/60 blur-md" />
          <Palm className="absolute -bottom-2 -left-10 h-[85%] text-palm" lean={22} />
          <Palm className="absolute right-0 -bottom-2 h-[60%] text-palm/80" lean={-14} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-night via-night/30 to-transparent" />
      <div className="relative p-6 sm:p-8">
        <h2 className="font-heading text-5xl leading-none tracking-wide text-white drop-shadow-lg sm:text-6xl">{character.name}</h2>
        {subtitle && <p className="mt-2 font-heading text-lg tracking-[0.25em] text-peach uppercase">{subtitle}</p>}
        {character.quote && <p className="mt-2 max-w-xl text-sm text-white/80 italic">«{character.quote}»</p>}
      </div>
    </div>
  );
}

function SectionFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-6 pr-16 sm:p-8 sm:pr-20">
      <h2 className="mb-5 font-heading text-4xl tracking-wide text-sunset">{title}</h2>
      {children}
    </div>
  );
}

function FreeText({ text, isOwner }: { text: string | null; isOwner: boolean }) {
  if (!text) {
    return (
      <p className="text-sm text-muted-foreground">
        Ancora niente qui.{isOwner && " Clicca la matita per scrivere questa sezione."}
      </p>
    );
  }
  return <p className="max-w-2xl text-[0.95rem] leading-relaxed whitespace-pre-line text-foreground/90">{text}</p>;
}

const SEX_LABELS: Record<string, string> = { M: "Maschile", F: "Femminile", X: "Non binario" };

function DataList({ character, online, since, rules }: { character: SheetCharacter; online: boolean; since: string; rules: RulesData }) {
  const option = (id: string | null) => rules.sheetOptions.find((o) => o.id === id)?.name ?? "—";
  const rows = [
    { label: "Nome", value: character.name },
    { label: "Sesso", value: character.sex ? SEX_LABELS[character.sex] : "—" },
    { label: "Età", value: character.age ? `${character.age} anni` : "—" },
    { label: "Nato/a il", value: formatBirthDate(character.birth_date) },
    { label: "Nazionalità", value: character.nationality || "—" },
    { label: "Prestavolto", value: character.face_claim || "—" },
    { label: "Indirizzo di studio", value: option(character.study_track_id) },
    { label: "Anno di corso", value: option(character.year_id) },
    { label: "Squadra o club", value: character.club_id ? option(character.club_id) : "—" },
    { label: "Lavoro", value: character.occupation ?? "—" },
    { label: "Quartiere", value: character.district?.name ?? "—" },
    { label: "PX da spendere", value: String(character.px) },
    { label: "A Miami dal", value: since },
    { label: "Stato", value: online ? "Online" : "Offline" },
  ];
  return (
    <dl className="grid max-w-2xl gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="rounded-xl bg-white/5 px-4 py-3">
          <dt className="text-xs tracking-wider text-lavender uppercase">{r.label}</dt>
          <dd className="mt-0.5 font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatBars({ build, rules }: { build: CharacterBuild; rules: RulesData }) {
  return (
    <ul className="flex max-w-2xl flex-col gap-4">
      {rules.attributes.map((a) => {
        const value = build.attributes[a.id] ?? 0;
        return (
          <li key={a.id}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="tracking-wide uppercase">
                <span className="text-peach">{a.code}</span> · {a.name}
              </span>
              <span className="text-muted-foreground">{value}/10</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-violet via-flamingo to-peach" style={{ width: `${value * 10}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Abilità raggruppate per caratteristica, con il totale caratteristica + abilità */
function SkillList({ build, rules }: { build: CharacterBuild; rules: RulesData }) {
  const groups = rules.attributes
    .map((a) => ({ attr: a, skills: rules.skills.filter((s) => s.attribute_id === a.id && (build.skills[s.id] ?? 0) > 0) }))
    .filter((g) => g.skills.length > 0);
  if (groups.length === 0) return <p className="text-sm text-muted-foreground">Nessuna abilità addestrata.</p>;
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {groups.map(({ attr, skills }) => {
        const attrValue = build.attributes[attr.id] ?? 0;
        return (
          <section key={attr.id}>
            <h3 className="mb-2 flex justify-between font-heading text-xl tracking-wide">
              <span>
                <span className="text-peach">{attr.code}</span> · {attr.name}
              </span>
              <span className="text-base text-muted-foreground">{attrValue}</span>
            </h3>
            <ul className="flex flex-col gap-1.5">
              {skills.map((s) => {
                const level = build.skills[s.id] ?? 0;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate" title={s.description}>{s.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="flex gap-0.5" aria-label={`Livello ${level}`}>
                        {Array.from({ length: 10 }, (_, i) => (
                          <span key={i} className={cn("size-2 rounded-full", i < level ? "bg-flamingo" : "bg-white/15")} />
                        ))}
                      </span>
                      <span className="w-14 text-right text-xs text-muted-foreground">
                        totale <strong className="text-foreground">{attrValue + level}</strong>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const OPTION_TITLES = { tenore: "Patrimonio", vantaggio: "Vantaggi", svantaggio: "Svantaggi", tratto: "Tratti" } as const;

function ChosenOptions({ build, rules }: { build: CharacterBuild; rules: RulesData }) {
  const chosen = rules.options.filter((o) => build.optionIds.includes(o.id));
  if (chosen.length === 0) return <p className="text-sm text-muted-foreground">Nessun vantaggio, svantaggio o tratto.</p>;
  return (
    <div className="grid max-w-2xl gap-4 @lg:grid-cols-2">
      {(Object.keys(OPTION_TITLES) as (keyof typeof OPTION_TITLES)[]).map((kind) => {
        const items = chosen.filter((o) => o.kind === kind);
        if (items.length === 0) return null;
        return (
          <section key={kind}>
            <h3 className="mb-2 font-heading text-lg tracking-wide text-peach">{OPTION_TITLES[kind]}</h3>
            <ul className="flex flex-col gap-1.5">
              {items.map((o) => (
                <li key={o.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <p className="font-medium">{o.name}</p>
                  {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Stato della scheda (bozza, in attesa, rifiutata) e, per chi può, Approva/Rifiuta */
function StatusBanner({ character, canReview }: { character: SheetCharacter; canReview: boolean }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (character.status === "approvata") return null;

  function review(approve: boolean) {
    startTransition(async () => {
      const result = await reviewCharacter(character.id, approve, reason);
      if (!result.ok) setError(result.error ?? "Operazione non riuscita.");
    });
  }

  const label =
    character.status === "in_attesa" ? "Scheda in attesa di approvazione" : character.status === "rifiutata" ? "Scheda rifiutata" : "Scheda in bozza";

  return (
    <div className="shrink-0 border-b border-peach/30 bg-peach/10 px-4 py-2 text-sm">
      <p className="font-semibold text-peach">{label}</p>
      {character.status === "rifiutata" && character.rejection_reason && <p className="text-white/80">Motivo: {character.rejection_reason}</p>}
      {canReview && character.status === "in_attesa" && (
        <div className="mt-2 flex flex-col gap-2">
          {rejecting && (
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo del rifiuto (lo vedrà il giocatore)"
              rows={2}
              maxLength={1000}
              className="bg-night/40"
            />
          )}
          {error && <p className="text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={() => review(true)} className="rounded-full">
              Approva
            </Button>
            {rejecting ? (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => review(false)} className="rounded-full">
                Conferma rifiuto
              </Button>
            ) : (
              <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(true)}>
                Rifiuta…
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Modifica ----------------------------- */

const initial: FormState = {};
const selectClass =
  "h-10 w-full rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function SectionEditor({
  section,
  character,
  districts,
  onDone,
}: {
  section: Section;
  character: SheetCharacter;
  districts: District[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateCharacter, initial);

  // Salvato: si torna alla visualizzazione
  useEffect(() => {
    if (state.success) onDone();
  }, [state, onDone]);

  return (
    <SectionFrame title={`Modifica · ${section.label}`}>
      <form action={action} className="flex max-w-2xl flex-col gap-4">
        <FormMessage state={state.error ? state : {}} />

        {section.key === "principale" && (
          <>
            <p className="text-sm text-muted-foreground">
              Incolla i link delle immagini (devono iniziare con https://). Il ritratto è quadrato; l&apos;immagine grande è orizzontale.
            </p>
            <EditField id="avatar_url" label="Ritratto (link immagine)">
              <Input id="avatar_url" name="avatar_url" type="url" defaultValue={character.avatar_url ?? ""} placeholder="https://…" className="h-10 bg-night/40" />
            </EditField>
            <EditField id="cover_url" label="Immagine grande (link immagine)">
              <Input id="cover_url" name="cover_url" type="url" defaultValue={character.cover_url ?? ""} placeholder="https://…" className="h-10 bg-night/40" />
            </EditField>
            <EditField id="quote" label="Frase che lo descrive">
              <Input id="quote" name="quote" maxLength={140} defaultValue={character.quote ?? ""} className="h-10 bg-night/40" />
            </EditField>
          </>
        )}

        {section.key === "dati" && (
          <>
            <EditField id="occupation" label="Lavoro">
              <Input id="occupation" name="occupation" maxLength={60} defaultValue={character.occupation ?? ""} className="h-10 bg-night/40" />
            </EditField>
            <EditField id="district_id" label="Quartiere">
              <select id="district_id" name="district_id" defaultValue={character.district_id ?? ""} className={selectClass}>
                <option value="">— Nessuno —</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </EditField>
          </>
        )}

        {section.field && (
          <EditField id={section.field} label={section.label}>
            {section.hint && <p className="-mt-1 text-xs text-muted-foreground">{section.hint}</p>}
            <Textarea
              id={section.field}
              name={section.field}
              rows={10}
              maxLength={section.field === "bio" ? 5000 : 3000}
              defaultValue={character[section.field] ?? ""}
              className="min-h-64 bg-night/40"
            />
          </EditField>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Annulla
          </Button>
          <Button type="submit" disabled={pending} className="rounded-full px-6">
            {pending ? "Salvataggio…" : "Salva"}
          </Button>
        </div>
      </form>
    </SectionFrame>
  );
}

function EditField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function SettingsPanel({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <SectionFrame title="Impostazioni">
      <div className="flex max-w-xl flex-col gap-4">
        <div className="rounded-xl bg-white/5 px-4 py-3">
          <p className="text-xs tracking-wider text-lavender uppercase">Nome di accesso</p>
          <p className="mt-0.5 font-medium">{name}</p>
          <p className="mt-1 text-xs text-muted-foreground">È il nome del personaggio e non si può cambiare.</p>
        </div>
        <Link href="/nuova-password" className={cn(buttonVariants({ variant: "outline" }), "w-fit rounded-full")}>
          <KeyRound /> Cambia password
        </Link>
        <h3 className="mt-2 font-heading text-2xl tracking-wide">Preferenze</h3>
        <p className="-mt-2 text-xs text-muted-foreground">Valgono per il tuo account, su qualsiasi dispositivo.</p>
        <PrefsPanel />
        <Button type="button" variant="ghost" onClick={onClose} className="w-fit">
          Torna alla scheda
        </Button>
      </div>
    </SectionFrame>
  );
}

/* ----------------------------- Cornice ----------------------------- */

export type SheetVariant = "page" | "modal";

/**
 * Cornice della scheda: barra del titolo "SCHEDA · NOME" e X per chiudere.
 * Nella finestra la barra serve anche per trascinarla.
 */
export function SheetFrame({ title, variant, children }: { title: string; variant: SheetVariant; children: React.ReactNode }) {
  const router = useRouter();
  const closeModal = useCloseModal();
  const inModal = variant === "modal";
  // In finestra si torna alla pagina sotto; a pagina intera si va alla mappa
  const close = () => (inModal ? closeModal() : router.push("/mappa"));

  return (
    <div
      className={cn(
        "@container flex flex-col overflow-hidden",
        inModal ? "h-full" : "glass rounded-3xl bg-night/60 shadow-2xl lg:h-[calc(100dvh-5rem)]",
      )}
    >
      <header
        data-window-drag={inModal ? "" : undefined}
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5",
          inModal && "cursor-grab touch-none select-none active:cursor-grabbing",
        )}
      >
        <h1 className="truncate rounded-md bg-gradient-to-r from-flamingo/80 via-orchid/50 to-transparent px-3 py-1 font-heading text-xl tracking-[0.12em] text-white">
          {title}
        </h1>
        <button type="button" onClick={close} className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Chiudi la scheda">
          <X className="size-5" />
        </button>
      </header>
      {children}
    </div>
  );
}

/** Scheda di chi non ha ancora creato il personaggio: al centro il pulsante "Crea personaggio" */
export function NewCharacterSheet({ name, variant = "page" }: { name: string; variant?: SheetVariant }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    startTransition(async () => {
      const result = await startCharacter();
      if (!result.ok) setError(result.error ?? "Non è stato possibile creare il personaggio.");
    });
  }

  return (
    <SheetFrame title={`Scheda · ${name}`} variant={variant}>
      <div className="relative grid min-h-[20rem] flex-1 place-items-center overflow-hidden p-6 text-center">
          <div className="absolute inset-0 bg-gradient-to-b from-violet/40 via-flamingo/20 to-transparent" />
          <Palm className="absolute -bottom-2 -left-8 h-[70%] text-palm/60" lean={20} />
          <Palm className="absolute right-0 -bottom-2 h-[50%] text-palm/50" lean={-12} />
          <div className="relative flex flex-col items-center gap-4">
            <p className="font-heading text-4xl tracking-wide text-white">{name}</p>
            <p className="max-w-sm text-sm text-white/80">Il tuo personaggio non è ancora attivo: crealo per entrare in gioco.</p>
            <Button type="button" size="lg" disabled={pending} onClick={create} className="h-12 rounded-full px-8 text-base shadow-[0_8px_30px_rgb(255_121_176/0.45)]">
              <UserRoundPlus /> {pending ? "Un attimo…" : "Crea personaggio"}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
      </div>
    </SheetFrame>
  );
}
