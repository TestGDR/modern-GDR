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
  GraduationCap,
  House,
  BriefcaseBusiness,
  Heart,
  HeartPulse,
  IdCard,
  KeyRound,
  Pencil,
  ScanFace,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  UserRound,
  UserRoundPlus,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { FormMessage } from "@/components/auth/auth-forms";
import { FameSection } from "@/components/fame/fame-section";
import { RichEditor } from "@/components/guide/rich-editor";
import { SafeHtml } from "@/components/guide/safe-html";
import { AffectionsSection } from "@/components/game/affections";
import { ErrorBoundary } from "@/components/game/error-boundary";
import { HoverTip } from "@/components/game/hover-tip";
import { AlterationSection } from "@/components/game/alteration-section";
import { BackpackSection } from "@/components/game/backpack-section";
import { HealthSection } from "@/components/game/health-section";
import { SheetMusic } from "@/components/game/sheet-music";
import { SheetStatus } from "@/components/game/status-icons";
import { OptionRequestPanel } from "@/components/game/option-request";
import { ActionPointsBox } from "@/components/game/action-points-box";
import { XpGrantBox } from "@/components/admin/xp-grant-manager";
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
import type { CharacterAffiliations, CharacterBuild, RulesData } from "@/lib/data";
import { formatBirthDate, parseSettings, skillCost } from "@/lib/interlock";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import type { Character, CreationOption, District, FormState } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
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
  /** Si scrive con l'editor (HTML) */
  rich?: boolean;
};

const SECTIONS: Section[] = [
  { key: "principale", label: "Principale", icon: Sparkles },
  { key: "dati", label: "Dati", icon: IdCard },
  { key: "fama", label: "Fama", icon: Star },
  { key: "si-sa-che", label: "Si sa che", icon: Eye, field: "known_facts", rich: true, hint: "Voci, fatti noti, reputazione: ciò che a Miami si dice di lui o di lei." },
  { key: "affetti", label: "Affetti", icon: Heart },
  { key: "caratteristiche", label: "Caratteristiche", icon: Gauge },
  { key: "abilita", label: "Abilità", icon: Zap },
  { key: "tratti", label: "Tratti", icon: Fingerprint, field: "traits", hint: "Carattere: personalità, abitudini, pregi e difetti." },
  { key: "aspetto", label: "Aspetto", icon: ScanFace, field: "appearance", rich: true, hint: "Com'è fisicamente, come si veste, segni particolari." },
  { key: "storia", label: "Storia", icon: BookOpen, field: "bio", hint: "Da dove viene e cosa l'ha portato a Miami." },
  { key: "equipaggiamento", label: "Zaino", icon: Backpack, field: "equipment", hint: "Gli oggetti del Mercato: con sé (li vedono tutti) e nello zaino." },
];

type View = { section: string; mode: "view" | "edit" | "settings" | "admin" };

/** Sezioni visibili solo al proprietario e allo staff (personaggi.vedere_tutti) */
// lo Zaino è visibile a tutti, ma gli altri vedono solo gli oggetti "con sé" (lo filtra il database)
const PRIVATE_SECTIONS = ["caratteristiche", "abilita", "tratti", "storia"];

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
  /** Lavori e gruppi del personaggio */
  affiliations?: CharacterAffiliations;
  /** Caratteristiche, abilità, tratti, storia, equipaggiamento: proprietario e staff */
  canSeePrivate?: boolean;
  /** Staff del combattimento: PF, stato e ferite a mano */
  canManageHealth?: boolean;
  /** Staff dei PX: punti azione della settimana, con le correzioni */
  canAssignPx?: boolean;
};

/** Scheda del personaggio a sezioni, nello stile "finestra" del gioco */
export function CharacterSheetWindow({
  character,
  isOwner,
  districts = [],
  variant = "page",
  build,
  rules,
  canReview = false,
  isAdmin = false,
  affiliations = { jobs: [], groups: [], teams: [], wealth: null, joinedAt: null, lastLoginAt: null },
  canSeePrivate = false,
  canAssignPx = false,
  canManageHealth = false,
}: CharacterSheetWindowProps) {
  const [view, setView] = useState<View>({ section: "principale", mode: "view" });
  const section = SECTIONS.find((s) => s.key === view.section) ?? SECTIONS[0];
  // gli affetti si modificano direttamente nella sezione (aggiungi, sposta, dedica)
  // lo Zaino non si scrive: si riempie con gli oggetti del Mercato
  // la Storia, dopo l'invio della scheda, la cambia solo l'Amministratore (lo controlla anche il database)
  const storiaLocked = section.key === "storia" && !isAdmin && (character.status === "approvata" || character.status === "in_attesa");
  const canEdit = isOwner && !storiaLocked && !["caratteristiche", "abilita", "affetti", "equipaggiamento"].includes(section.key);
  // l'Amministratore cambia caratteristiche e abilità dall'Amministrazione della scheda
  const staffEdit = isAdmin && (section.key === "caratteristiche" || section.key === "abilita");

  const open = (key: string) => setView({ section: key, mode: "view" });

  return (
    <SheetFrame title={`Scheda · ${character.name}`} variant={variant}>
      <StatusBanner character={character} canReview={canReview} />
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto @2xl:grid-cols-[16rem_minmax(0,1fr)] @2xl:overflow-hidden">
        {/* Colonna sinistra: ritratto e sezioni */}
        <aside className="contents @2xl:flex @2xl:min-h-0 @2xl:flex-col @2xl:border-r @2xl:border-white/10">
          {/* sul cellulare il ritratto e gli stati stanno sulla foto della Principale */}
          <div className="hidden items-center gap-3 p-4 @2xl:flex @2xl:justify-center @2xl:pb-3">
            <Portrait character={character} />
            {/* ruolo staff e stati del personaggio (alcol, droghe, insonnia), sotto la musica */}
            <span className="flex flex-col items-center gap-2">
              <SheetStatus characterId={character.id} />
              {character.music_url && <SheetMusic key={character.music_url} url={character.music_url} />}
            </span>
          </div>

          <nav
            className="sticky top-0 z-20 flex overflow-x-auto border-b border-white/10 bg-night/85 backdrop-blur [scrollbar-width:none] @2xl:static @2xl:flex-1 @2xl:flex-col @2xl:overflow-y-auto @2xl:border-b-0 @2xl:bg-transparent @2xl:backdrop-blur-none"
            aria-label="Sezioni della scheda"
          >
            {SECTIONS.map(({ key, label, icon: Icon }) => {
              const active = view.section === key && view.mode !== "settings";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => open(key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // cellulare: linguette a riquadro con il titolo in Bebas; computer: elenco a sinistra come prima
                    "flex shrink-0 items-center gap-2 border-r border-white/5 px-4 py-3 font-heading text-base tracking-[0.14em] whitespace-nowrap uppercase transition-colors",
                    "@2xl:border-r-0 @2xl:border-b @2xl:px-5 @2xl:py-2 @2xl:font-sans @2xl:text-xs @2xl:font-medium @2xl:tracking-wide",
                    active
                      ? "bg-gradient-to-b from-flamingo/45 to-flamingo/10 text-white shadow-[inset_0_-2px_0_var(--peach)] @2xl:bg-gradient-to-r @2xl:from-flamingo/35 @2xl:to-flamingo/5 @2xl:shadow-[inset_3px_0_0_var(--flamingo)]"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("hidden size-3.5 shrink-0 @2xl:block", active ? "text-peach" : "text-lavender/70")} />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Pulsanti in fondo */}
          <div className="hidden justify-center gap-2 border-t border-white/10 p-2.5 @2xl:flex">
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
                  label={
                    canEdit
                      ? `Modifica ${section.label}`
                      : staffEdit
                        ? "Modifica caratteristiche e abilità (Amministrazione della scheda)"
                        : section.key === "affetti"
                          ? "Gli affetti si modificano direttamente nella sezione"
                          : storiaLocked
                            ? "La storia la modifica solo l'Amministratore"
                            : "Dopo l'approvazione caratteristiche e abilità le modifica lo staff"
                  }
                  active={view.mode === "edit" || (staffEdit && view.mode === "admin")}
                  disabled={!canEdit && !staffEdit}
                  onClick={() =>
                    setView((v) =>
                      staffEdit ? { ...v, mode: v.mode === "admin" ? "view" : "admin" } : { ...v, mode: v.mode === "edit" ? "view" : "edit" },
                    )
                  }
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

          {/* se una sezione si rompe, il messaggio resta qui e il resto della scheda funziona */}
          <ErrorBoundary key={`${section.key}-${view.mode}`} what="questa sezione della scheda">
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
              majors={rules.sheetOptions.filter((o) => o.kind === "indirizzo")}
              onDone={() => setView((v) => ({ ...v, mode: "view" }))}
            />
          ) : section.key === "principale" ? (
            <MainSection
              character={character}
              badges={
                <>
                  <SheetStatus characterId={character.id} />
                  {character.music_url && <SheetMusic key={character.music_url} url={character.music_url} />}
                </>
              }
            />
          ) : section.key === "dati" ? (
            <DataList character={character} rules={rules} affiliations={affiliations} />
          ) : section.key === "fama" ? (
            <SectionFrame title="Fama">
              <FameSection characterId={character.id} />
            </SectionFrame>
          ) : section.key === "affetti" ? (
            <SectionFrame title="Affetti">
              <AffectionsSection characterId={character.id} canEdit={isOwner || isAdmin} legacyText={character.relationships} />
            </SectionFrame>
          ) : PRIVATE_SECTIONS.includes(section.key) && !canSeePrivate ? (
            <SectionFrame title={section.label}>
              <p className="text-sm text-muted-foreground">Non hai i permessi necessari.</p>
            </SectionFrame>
          ) : section.key === "caratteristiche" ? (
            <SectionFrame title="Caratteristiche">
              <StatBars build={build} rules={rules} />
              <p className="mt-6 text-xs text-muted-foreground">Le caratteristiche non cambiano dopo l&apos;approvazione.</p>
              {/* PF e ferite: proprietario e staff (lo controlla anche il database, can_see_health) */}
              <h3 className="mt-8 mb-3 flex items-center gap-2 font-heading text-xl tracking-wide text-peach">
                <HeartPulse className="size-5" /> Salute
              </h3>
              <HealthSection characterId={character.id} canManage={canManageHealth} />
              {/* alcol, droghe e postumi in corso */}
              <AlterationSection characterId={character.id} canClear={canManageHealth} />
            </SectionFrame>
          ) : section.key === "abilita" ? (
            <SectionFrame title="Abilità">
              <SkillList character={character} build={build} rules={rules} canGrow={isOwner && character.status === "approvata"} canAssignPx={canAssignPx && character.status === "approvata"} />
            </SectionFrame>
          ) : section.key === "tratti" ? (
            <SectionFrame title="Tratti">
              <ChosenOptions build={build} rules={rules} characterId={character.id} />
              {isOwner && character.status === "approvata" && <OptionRequestPanel character={character} rules={rules} build={build} />}
              <h3 className="mt-6 mb-2 font-heading text-xl tracking-wide text-peach">Carattere</h3>
              <FreeText text={character.traits} isOwner={isOwner} />
            </SectionFrame>
          ) : section.key === "equipaggiamento" ? (
            <SectionFrame title="Zaino">
              <BackpackSection characterId={character.id} isOwner={isOwner} canSeeAll={canSeePrivate} />
            </SectionFrame>
          ) : (
            <SectionFrame title={section.label}>
              <FreeText text={section.field ? character[section.field] : null} isOwner={isOwner && !storiaLocked} html={section.rich} />
            </SectionFrame>
          )}
          </ErrorBoundary>
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
        "grid size-8 place-items-center rounded-lg border border-white/15 bg-night/60 text-white/80 backdrop-blur transition-colors hover:border-flamingo/60 hover:text-white disabled:opacity-40 [&_svg]:size-3.5",
        active && "border-flamingo bg-flamingo/20 text-white",
      )}
    >
      {children}
    </button>
  );
}

function Portrait({ character }: { character: SheetCharacter }) {
  return (
    <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl border border-peach/40 bg-gradient-to-br from-violet via-orchid to-peach shadow-lg">
      {character.avatar_url ? (
        // Immagini esterne inserite dal giocatore: niente ottimizzazione di Next
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character.avatar_url} alt={`Ritratto di ${character.name}`} className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center font-heading text-4xl tracking-wider text-white">{initials(character.name)}</span>
      )}
    </div>
  );
}

/**
 * Sezione Principale: sul computer immagine orizzontale 640x560 (8:7);
 * sul cellulare (o con la finestra stretta) scheda verticale 9:16 (circa 360x640)
 * con la sua immagine, o quella del computer se manca.
 */
function MainSection({ character, badges }: { character: SheetCharacter; badges: React.ReactNode }) {
  return (
    <>
      <div className="hidden @2xl:block">
        <MainCover character={character} src={character.cover_url} className="aspect-[8/7] max-w-[640px]" />
      </div>
      <div className="@2xl:hidden">
        {/* a tutta finestra: la foto prende la larghezza e l'altezza che restano sotto le schede */}
        <MainCover
          character={character}
          src={character.cover_mobile_url ?? character.cover_url}
          className="aspect-[9/16] max-h-[calc(100dvh-7.5rem)] min-h-[28rem]"
          badges={badges}
        />
      </div>
    </>
  );
}

function MainCover({ character, src, className, badges }: { character: SheetCharacter; src: string | null; className: string; badges?: React.ReactNode }) {
  const subtitle = [character.occupation, character.district?.name].filter(Boolean).join(" · ");
  return (
    <div className={cn("relative mx-auto flex w-full flex-col justify-end overflow-hidden", className)}>
      {badges && <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">{badges}</div>}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Immagine di ${character.name}`} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className={cn("absolute inset-0 bg-gradient-to-b", character.district?.gradient ?? "from-violet via-flamingo to-peach")}>
          <div className="absolute bottom-[22%] left-1/2 size-40 -translate-x-1/2 rounded-full bg-sand/60 blur-md" />
          <Palm className="absolute -bottom-2 -left-10 h-[85%] text-palm" lean={22} />
          <Palm className="absolute right-0 -bottom-2 h-[60%] text-palm/80" lean={-14} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-night via-night/30 to-transparent" />
      <div className="relative p-5 sm:p-8">
        <h2 className="font-heading text-5xl leading-none tracking-[0.06em] text-white drop-shadow-lg sm:text-6xl">{character.name}</h2>
        {subtitle && <p className="mt-2 font-heading text-base tracking-[0.3em] text-peach uppercase drop-shadow sm:text-lg">{subtitle}</p>}
        {character.quote && <p className="mt-2 max-w-xl text-sm text-white/80 italic">«{character.quote}»</p>}
      </div>
    </div>
  );
}

function SectionFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-5 pr-14 @3xl:p-6 @3xl:pr-16">
      <h2 className="mb-4 font-heading text-3xl tracking-wide text-sunset">{title}</h2>
      {children}
    </div>
  );
}

function FreeText({ text, isOwner, html }: { text: string | null; isOwner: boolean; html?: boolean }) {
  if (!text) {
    return (
      <p className="text-sm text-muted-foreground">
        Ancora niente qui.{isOwner && " Clicca la matita per scrivere questa sezione."}
      </p>
    );
  }
  // testo dell'editor: HTML ripulito (i testi vecchi senza HTML restano testo semplice)
  if (html) return <SafeHtml html={text} className="max-w-2xl text-sm leading-relaxed text-foreground/90" />;
  return <p className="max-w-2xl text-sm leading-relaxed whitespace-pre-line text-foreground/90">{text}</p>;
}

const SEX_LABELS: Record<string, string> = { M: "Maschile", F: "Femminile", X: "Non binario" };

/** Sezione Dati: banner con il nome, poi i dati divisi in blocchi */
function DataList({ character, rules, affiliations }: { character: SheetCharacter; rules: RulesData; affiliations: CharacterAffiliations }) {
  const option = (id: string | null) => (id ? (rules.sheetOptions.find((o) => o.id === id)?.name ?? "—") : "—");
  // patrimonio (fascia di ricchezza) scelto in creazione
  const wealth = affiliations.wealth;
  // sotto il nome: età, quartiere di residenza, patrimonio
  const subtitle = [character.age ? `${character.age} anni` : null, character.district?.name ?? null, wealth].filter(Boolean);
  const born = character.birth_date ? `${formatBirthDate(character.birth_date)}${character.age ? ` (${character.age} anni)` : ""}` : "—";
  // icone: nome al passaggio del mouse, clic = pagina del lavoro, gruppo o squadra
  const jobs: OrgBadge[] = affiliations.jobs.map((j) => ({
    key: j.id,
    icon: j.icon,
    fallback: j.name,
    label: `${j.name}${j.role ? ` · ${j.role}` : ""} (${j.kind === "full_time" ? "full time" : "part time"})`,
    href: `/utility/lavori?apri=${j.id}`,
  }));
  const groups: OrgBadge[] = affiliations.groups.map((g) => ({
    key: g.id,
    icon: g.icon,
    fallback: g.name,
    label: g.role ? `${g.name} · ${g.role}` : g.name,
    href: `/utility/gruppi?apri=${g.id}`,
  }));
  const squad = { starter: "titolare", reserve: "riserva", captain: "capitano", redshirt: "redshirt" } as const;
  const teams: OrgBadge[] = affiliations.teams.map((t) => ({
    key: t.groupId ?? t.sport,
    icon: t.groupIcon,
    fallback: t.icon,
    emoji: !t.groupIcon,
    label: `${t.sport}${t.position ? ` · ${t.position}` : ""} (${squad[t.status]})`,
    href: t.groupId ? `/utility/gruppi?apri=${t.groupId}` : "/sport",
  }));
  return (
    <div className="flex flex-col">
      <DataBanner name={character.name} subtitle={subtitle as string[]} />
      <div className="flex flex-col gap-3 px-4 py-3 @3xl:px-5">
        <DataBlock icon={<UserRound />} title="Informazioni personali" cols={4}>
          <DataCard label="Nato/a il" value={born} />
          <DataCard label="Sesso" value={character.sex ? SEX_LABELS[character.sex] : "—"} />
          <DataCard label="Nazionalità" value={character.nationality || "—"} />
          <DataCard label="Prestavolto" value={character.face_claim || "—"} />
          <DataCard label="Altezza" value={character.height || "—"} />
          <DataCard label="Peso" value={character.weight || "—"} />
          <DataCard label="Colore occhi" value={character.eye_color || "—"} />
          <DataCard label="Colore capelli" value={character.hair_color || "—"} />
        </DataBlock>
        <DataBlock icon={<GraduationCap />} title="Studio" cols={3}>
          <DataCard label="Major" value={option(character.study_track_id)} />
          <DataCard label="Minor" value={option(character.minor_id)} />
          <DataCard label="Anno di corso" value={option(character.year_id)} />
        </DataBlock>
        {character.residence && (
          <DataBlock icon={<House />} title="Dove vive" cols={1}>
            <dd className="whitespace-pre-line rounded-xl border border-white/10 bg-night/30 px-3 py-2 text-sm">{character.residence}</dd>
          </DataBlock>
        )}
        <DataBlock icon={<BriefcaseBusiness />} title="Gruppi e lavoro" cols={3}>
          <BadgeCard label={jobs.length > 1 ? "Lavori" : "Lavoro"} badges={jobs} />
          <BadgeCard label="Gruppi di gioco" badges={groups} />
          <BadgeCard label="Squadra sportiva" badges={teams} />
        </DataBlock>
        {/* in piccolo, fuori dalle categorie */}
        <p className="flex flex-wrap gap-x-4 gap-y-0.5 px-1 text-[0.7rem] text-muted-foreground">
          <span>
            Iscritto il <span className="text-foreground/80">{affiliations.joinedAt ? formatDate(affiliations.joinedAt) : "—"}</span>
          </span>
          <span>
            Ultimo accesso <span className="text-foreground/80">{affiliations.lastLoginAt ? formatDateTime(affiliations.lastLoginAt) : "—"}</span>
          </span>
        </p>
      </div>
    </div>
  );
}

/** Banner al tramonto (immagine di Miami), con il nome del personaggio */
function DataBanner({ name, subtitle }: { name: string; subtitle: string[] }) {
  return (
    <div className="relative h-32 shrink-0 overflow-hidden border-b border-white/10">
      {/* l'immagine riempie il banner; il taglio tiene il centro della scena */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/banner-miami.webp" alt="" aria-hidden className="absolute inset-0 size-full object-cover object-[center_60%]" />
      <div className="absolute inset-0 bg-gradient-to-r from-night/55 via-night/15 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-night/45 via-transparent to-transparent" />
      <div className="relative flex h-full flex-col justify-end px-5 pb-3">
        <h2 className="font-heading text-4xl leading-none tracking-wide text-white drop-shadow-lg @3xl:text-5xl">{name}</h2>
        {subtitle.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-white/90 @3xl:text-sm">
            {subtitle.map((part, i) => (
              <span key={i} className="flex items-center gap-2.5">
                {i > 0 && <span className="text-white/60">·</span>}
                {part}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

/** Blocco di dati con titolo spaziato e linea, come nella scheda grafica */
function DataBlock({ icon, title, cols, children }: { icon: React.ReactNode; title: string; cols: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-2">
        <span className="text-flamingo [&_svg]:size-4">{icon}</span>
        <span className="font-heading text-sm tracking-[0.18em] text-flamingo uppercase @3xl:text-base @3xl:tracking-[0.26em]">{title}</span>
        <span className="h-px flex-1 bg-gradient-to-r from-flamingo/60 to-flamingo/10" />
      </h3>
      <dl className={cn("grid gap-2", cols === 1 ? "grid-cols-1" : "grid-cols-2", cols === 3 && "@3xl:grid-cols-3", cols === 4 && "@3xl:grid-cols-4")}>{children}</dl>
    </section>
  );
}

/** Icona di un lavoro, gruppo o squadra nella scheda */
type OrgBadge = { key: string; icon: string | null; fallback: string; emoji?: boolean; label: string; href: string };

/** Riquadro dei Dati con le sole icone: nome al passaggio del mouse, clic = pagina in finestra */
function BadgeCard({ label, badges }: { label: string; badges: OrgBadge[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
      <dt className="text-[0.6rem] font-medium tracking-wider text-lavender uppercase">{label}</dt>
      <dd className="flex min-h-[30px] flex-wrap items-center gap-2 py-0.5 text-[0.8rem] font-medium text-white">
        {badges.length === 0 && "—"}
        {badges.map((b) => (
          <HoverTip key={b.key} label={b.label} className="inline-flex">
            <Link href={b.href} aria-label={b.label} className="rounded-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-flamingo">
              {b.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.icon} alt="" className="size-[30px] rounded object-contain" />
              ) : (
                <span className={cn("grid size-[30px] place-items-center rounded-md bg-white/10", b.emoji ? "text-lg" : "font-heading text-sm")}>
                  {b.emoji ? b.fallback : initials(b.fallback)}
                </span>
              )}
            </Link>
          </HoverTip>
        ))}
      </dd>
    </div>
  );
}

/** Riquadro dei Dati; con `lines` mostra più righe, ognuna con la sua icona (lavori, gruppi) */
function DataCard({ label, value, lines }: { label: string; value: string; lines?: { icon: string | null; text: string }[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
      <dt className="text-[0.6rem] font-medium tracking-wider text-lavender uppercase">{label}</dt>
      {lines && lines.length > 0 ? (
        <dd className="flex flex-col gap-0.5 text-[0.8rem] font-medium text-white">
          {lines.map((l, i) => (
            <span key={i} className="flex items-center gap-1.5 break-words">
              {l.icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.icon} alt="" className="size-[30px] shrink-0 rounded object-contain" />
              )}
              {l.text}
            </span>
          ))}
        </dd>
      ) : (
        <dd className="text-[0.8rem] font-medium break-words whitespace-pre-line text-white">{value}</dd>
      )}
    </div>
  );
}

function StatBars({ build, rules }: { build: CharacterBuild; rules: RulesData }) {
  return (
    <ul className="flex max-w-2xl flex-col gap-4">
      {rules.attributes.map((a) => {
        const value = build.attributes[a.id] ?? 0;
        return (
          <li key={a.id}>
            <div className="mb-1.5 flex items-center gap-2 text-sm">
              <span className="tracking-wide uppercase">
                <span className="text-peach">{a.code}</span> · {a.name}
              </span>
              <span className="rounded-md bg-flamingo/20 px-1.5 text-xs font-semibold text-peach" title="Valore della caratteristica">
                {value}/10
              </span>
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
/** Ranghi di riuscita (caratteristica + abilità), dal più basso */
const RANKS = [
  { name: "Pessimo", cls: "bg-destructive/20 text-destructive", hint: "Le prove medie (CD 15) falliscono automaticamente." },
  { name: "Scadente", cls: "bg-peach/20 text-peach", hint: "Serve impegno per superare le prove medie (CD 15)." },
  { name: "Buono", cls: "bg-sand/20 text-sand", hint: "Tendenzialmente si superano le prove medie (CD 15)." },
  { name: "Ottimo", cls: "bg-mint/20 text-mint", hint: "Solo la sfortuna impedirà di superare le prove medie (CD 15)." },
  { name: "Eccellenza", cls: "bg-lavender/25 text-lavender", hint: "Solo la sfortuna impedirà di superare le prove difficili (CD 20)." },
];

/** Soglie da Gestione → Impostazioni ("soglie_riuscita"), con quelle predefinite */
function rankThresholds(rules: RulesData) {
  const v = rules.settings.find((x) => x.key === "soglie_riuscita")?.value;
  return Array.isArray(v) && v.length === 4 ? v.map(Number) : [5, 10, 13, 18];
}

function rankOf(score: number, thresholds: number[]) {
  let i = 0;
  while (i < thresholds.length && score >= thresholds[i]) i++;
  return RANKS[i];
}

function SkillList({ character, build, rules, canGrow, canAssignPx }: { character: SheetCharacter; build: CharacterBuild; rules: RulesData; canGrow: boolean; canAssignPx: boolean }) {
  const router = useRouter();
  const [growing, startGrow] = useTransition();
  const [growMsg, setGrowMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // +1 livello pagando i PX (10 × il nuovo livello), mai oltre la caratteristica
  function grow(skillId: string, name: string, next: number, cost: number) {
    if (!window.confirm(`Portare ${name} a ${next} per ${cost} PX?`)) return;
    startGrow(async () => {
      const { error } = await createClient().rpc("skill_upgrade", { p_character: character.id, p_skill: skillId });
      setGrowMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${name} ora è a ${next} (−${cost} PX).` });
      router.refresh();
    });
  }
  // Tutte le abilità, anche a 0: i PX si spendono anche lì e i dadi si tirano anche lì
  const groups = rules.attributes
    .map((a) => ({ attr: a, skills: rules.skills.filter((s) => s.attribute_id === a.id) }))
    .filter((g) => g.skills.length > 0);
  // PX accumulati da sempre = da spendere + spesi nelle abilità + costo delle scelte
  // (gli svantaggi hanno costo negativo: i PX che danno contano tra gli accumulati)
  const settings = parseSettings(rules.settings);
  const spentSkills = Object.values(build.skills).reduce((sum, level) => sum + skillCost(level, settings), 0);
  const spentOptions = rules.options.filter((o) => build.optionIds.includes(o.id)).reduce((sum, o) => sum + o.cost_px * (build.optionDetails[o.id]?.level ?? 1), 0);
  const total = character.px + spentSkills + spentOptions;
  const thresholds = rankThresholds(rules);
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-flamingo/30 bg-flamingo/10 px-4 py-2">
          <p className="text-[0.65rem] font-medium tracking-wider text-lavender uppercase">PX da spendere</p>
          <p className="font-heading text-3xl tracking-wide text-peach">{character.px}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2">
          <p className="text-[0.65rem] font-medium tracking-wider text-lavender uppercase">PX accumulati</p>
          <p className="font-heading text-3xl tracking-wide text-white">{total}</p>
        </div>
      </div>
      {(canGrow || canAssignPx) && <ActionPointsBox characterId={character.id} canAdjust={canAssignPx} />}
      {canAssignPx && <XpGrantBox characterId={character.id} />}
      {canGrow && (
        <p className="text-xs text-muted-foreground">
          Con i PX da spendere alzi un&apos;abilità di un livello con il pulsante <strong className="text-peach">+</strong>: costa 10 × il nuovo livello e non supera mai la caratteristica.
        </p>
      )}
      {growMsg && <p className={cn("rounded-lg px-3 py-1.5 text-sm", growMsg.ok ? "bg-mint/15 text-mint" : "bg-destructive/15 text-destructive")}>{growMsg.text}</p>}
      <ul className="flex flex-col gap-0.5 rounded-xl bg-white/[0.04] px-3 py-2 text-[0.7rem] text-muted-foreground">
        {RANKS.map((r, i) => (
          <li key={r.name} className="flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-full px-1.5 font-semibold uppercase", r.cls)}>{r.name}</span>
            <span>
              {i === 0 ? `fino a ${thresholds[0] - 1}` : i < 4 ? `da ${thresholds[i - 1]} a ${thresholds[i] - 1}` : `da ${thresholds[3]}`}: {r.hint}
            </span>
          </li>
        ))}
      </ul>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">Nessuna abilità nel sistema.</p>}
      {groups.map(({ attr, skills }) => {
        const attrValue = build.attributes[attr.id] ?? 0;
        return (
          <section key={attr.id}>
            <h3 className="mb-2 flex items-center gap-2 font-heading text-xl tracking-wide">
              <span>
                <span className="text-peach">{attr.code}</span> · {attr.name}
              </span>
              <span className="grid min-w-7 place-items-center rounded-md bg-flamingo/20 px-1.5 text-base text-peach" title="Valore della caratteristica">
                {attrValue}
              </span>
            </h3>
            <ul className="flex flex-col gap-1.5">
              {skills.map((s) => {
                const level = build.skills[s.id] ?? 0;
                return (
                  <li key={s.id} className={cn("flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-1.5 text-sm", level === 0 && "text-muted-foreground")}>
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
                      {(() => {
                        const rank = rankOf(attrValue + level, thresholds);
                        return (
                          <span className={cn("w-20 rounded-full px-2 py-0.5 text-center text-[0.65rem] font-semibold uppercase", rank.cls)} title={rank.hint}>
                            {rank.name}
                          </span>
                        );
                      })()}
                      {canGrow &&
                        (() => {
                          const next = level + 1;
                          const cost = settings.pxPerLevel * next;
                          const blocked = next > attrValue || next > settings.skillMax;
                          return (
                            <button
                              type="button"
                              disabled={growing || blocked || character.px < cost}
                              onClick={() => grow(s.id, s.name, next, cost)}
                              title={blocked ? "Non può superare la caratteristica" : `Porta a ${next}: ${cost} PX`}
                              aria-label={`Alza ${s.name} a ${next} (${cost} PX)`}
                              className="grid h-6 min-w-12 place-items-center rounded-full bg-flamingo/20 px-1.5 text-[0.65rem] font-semibold text-peach hover:bg-flamingo/35 disabled:opacity-30"
                            >
                              {blocked ? "max" : `+ ${cost}`}
                            </button>
                          );
                        })()}
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


/** Voci del personaggio divise per livello, con livello, scelta e usi rimasti */
function ChosenOptions({ build, rules, characterId }: { build: CharacterBuild; rules: RulesData; characterId: string }) {
  const chosen = rules.options.filter((o) => build.optionIds.includes(o.id) && o.kind !== "tenore");
  const [uses, setUses] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    createClient()
      .rpc("my_trait_uses", { p_character: characterId })
      .then(({ data }) => {
        if (alive) setUses(Object.fromEntries(((data ?? []) as { id: string; left: number }[]).map((u) => [u.id, u.left])));
      });
    return () => {
      alive = false;
    };
  }, [characterId]);
  if (chosen.length === 0) return <p className="text-sm text-muted-foreground">Nessun vantaggio, svantaggio o tratto.</p>;
  const groups: { title: string; items: CreationOption[] }[] = [
    { title: "Vantaggi", items: chosen.filter((o) => o.kind === "vantaggio" && o.scope === "generale") },
    { title: "Svantaggi", items: chosen.filter((o) => o.kind === "svantaggio" && o.scope === "generale") },
    { title: "Tratti", items: chosen.filter((o) => o.kind === "tratto" && o.scope === "generale") },
    { title: "Ambientazione", items: chosen.filter((o) => o.scope === "ambientazione" && !o.is_origin) },
    { title: "Provenienza", items: chosen.filter((o) => o.is_origin) },
    { title: "Accademiche", items: chosen.filter((o) => o.scope === "accademica") },
    { title: "Sportive", items: chosen.filter((o) => o.scope === "sportiva") },
  ];
  return (
    // un gruppo sotto l'altro; dentro, le voci in elenco a tutta larghezza
    <div className="flex flex-col gap-5">
      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <section key={g.title}>
            <h3 className="mb-2 font-heading text-lg tracking-wide text-peach">{g.title}</h3>
            <ul className="flex flex-col divide-y divide-white/10 overflow-hidden rounded-xl bg-white/5">
              {g.items.map((o) => {
                const d = build.optionDetails[o.id];
                return (
                  <li key={o.id} className="px-4 py-2.5 text-sm">
                    <p className="flex flex-wrap items-baseline gap-x-1.5 font-medium">
                      {o.name}
                      {o.max_level > 1 && <span className="text-xs text-peach">livello {d?.level ?? 1}</span>}
                      {d?.choice && <span className="text-xs text-lavender">· {d.choice}</span>}
                      {o.secret_default && <span className="text-[0.65rem] text-orchid">segreto</span>}
                      {o.id in uses && (
                        <span className={cn("ml-auto text-[0.65rem]", uses[o.id] > 0 ? "text-mint" : "text-muted-foreground")}>
                          {uses[o.id] > 0 ? "disponibile" : "già usato in questo periodo"}
                        </span>
                      )}
                    </p>
                    {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                    {d?.note && <p className="mt-1 text-xs whitespace-pre-line text-foreground/90 italic">«{d.note}»</p>}
                    {o.effects.some((e) => e.type === "linked_npc") && <p className="text-[0.7rem] text-orchid">Ha un PNG collegato: lo trovi in Utility → PNG.</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

/** Stato della scheda (bozza, in attesa, rifiutata) e, per chi può, Approva/Rifiuta */
function StatusBanner({ character, canReview }: { character: SheetCharacter; canReview: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (character.status === "approvata") return null;

  function review(approve: boolean) {
    startTransition(async () => {
      const result = await reviewCharacter(character.id, approve, reason);
      if (!result.ok) setError(result.error ?? "Operazione non riuscita.");
      // in ogni caso si rilegge la scheda: lo stato mostrato resta quello vero
      router.refresh();
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
  majors,
  onDone,
}: {
  section: Section;
  character: SheetCharacter;
  districts: District[];
  /** Indirizzi di studio, per scegliere il Minor */
  majors: { id: string; name: string }[];
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
              Incolla i link delle immagini (devono iniziare con https://). Qui sotto le misure reali in cui si vedono le immagini: se le proporzioni sono diverse, i bordi in eccesso vengono tagliati.
            </p>
            <EditField id="avatar_url" label="Ritratto (link immagine)">
              <p className="-mt-1 text-xs text-muted-foreground">Quadrato: si vede a 96 × 96 pixel nella scheda (80 × 80 nella barra in alto).</p>
              <Input id="avatar_url" name="avatar_url" type="url" defaultValue={character.avatar_url ?? ""} placeholder="https://…" className="h-10 bg-night/40" />
            </EditField>
            <EditField id="cover_url" label="Immagine grande per il computer (link immagine)">
              <p className="-mt-1 text-xs text-muted-foreground">
                Si vede a 640 × 560 pixel. Tieni il soggetto al centro: in basso a sinistra c&apos;è il nome.
              </p>
              <Input id="cover_url" name="cover_url" type="url" defaultValue={character.cover_url ?? ""} placeholder="https://…" className="h-10 bg-night/40" />
            </EditField>
            <EditField id="cover_mobile_url" label="Immagine per il cellulare (link immagine)">
              <p className="-mt-1 text-xs text-muted-foreground">
                Verticale: su un telefono si vede a circa 360 × 640 pixel (proporzioni 9:16, come lo schermo). Se manca, sul telefono si vede quella del computer, tagliata.
              </p>
              <Input id="cover_mobile_url" name="cover_mobile_url" type="url" defaultValue={character.cover_mobile_url ?? ""} placeholder="https://…" className="h-10 bg-night/40" />
            </EditField>
            <EditField id="music_url" label="Musica (link a un file mp3)">
              <p className="-mt-1 text-xs text-muted-foreground">
                Link diretto al file audio (deve iniziare con https:// e finire di solito con .mp3). Si ascolta da un piccolo lettore sotto gli stati, solo se chi apre la scheda preme play.
              </p>
              <Input id="music_url" name="music_url" type="url" defaultValue={character.music_url ?? ""} placeholder="https://…/canzone.mp3" className="h-10 bg-night/40" />
            </EditField>
            <EditField id="quote" label="Frase che lo descrive">
              <Input id="quote" name="quote" maxLength={140} defaultValue={character.quote ?? ""} className="h-10 bg-night/40" />
            </EditField>
          </>
        )}

        {section.key === "dati" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <EditField id="height" label="Altezza">
                <Input id="height" name="height" maxLength={20} defaultValue={character.height ?? ""} placeholder="Es. 1,82 m" className="h-10 bg-night/40" />
              </EditField>
              <EditField id="weight" label="Peso">
                <Input id="weight" name="weight" maxLength={20} defaultValue={character.weight ?? ""} placeholder="Es. 78 kg" className="h-10 bg-night/40" />
              </EditField>
              <EditField id="eye_color" label="Colore occhi">
                <Input id="eye_color" name="eye_color" maxLength={30} defaultValue={character.eye_color ?? ""} placeholder="Es. castani" className="h-10 bg-night/40" />
              </EditField>
              <EditField id="hair_color" label="Colore capelli">
                <Input id="hair_color" name="hair_color" maxLength={30} defaultValue={character.hair_color ?? ""} placeholder="Es. neri, ricci" className="h-10 bg-night/40" />
              </EditField>
            </div>
            <EditField id="minor_id" label="Minor">
              <select id="minor_id" name="minor_id" defaultValue={character.minor_id ?? ""} className={selectClass}>
                <option value="">— Nessuno —</option>
                {majors
                  .filter((m) => m.id !== character.study_track_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </EditField>
            <EditField id="residence" label="Dove vive?">
              <p className="-mt-1 text-xs text-muted-foreground">Al college o con i genitori, com&apos;è la casa, in che zona, con chi la divide.</p>
              <Textarea id="residence" name="residence" rows={4} maxLength={2000} defaultValue={character.residence ?? ""} className="bg-night/40" />
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

        {section.field && section.rich && <RichField name={section.field} label={section.label} hint={section.hint} initial={character[section.field] ?? ""} />}

        {section.field && !section.rich && (
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

/** Campo con l'editor: il testo (HTML) va nel modulo con un campo nascosto */
function RichField({ name, label, hint, initial }: { name: string; label: string; hint?: string; initial: string }) {
  const [html, setHtml] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      <RichEditor value={html} onChange={setHtml} minHeight="min-h-64" />
      <input type="hidden" name={name} value={html} />
      <p className="text-xs text-muted-foreground">{html.length.toLocaleString("it-IT")} / 20.000 caratteri</p>
    </div>
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
/** Account senza personaggio (aperto dagli online o dall'anagrafe) */
export function NoCharacterSheet({ name, variant = "page" }: { name: string; variant?: SheetVariant }) {
  return (
    <SheetFrame title={`Scheda · ${name}`} variant={variant}>
      <div className="relative grid min-h-[20rem] flex-1 place-items-center overflow-hidden p-6 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-violet/40 via-flamingo/20 to-transparent" />
        <Palm className="absolute -bottom-2 -left-8 h-[70%] text-palm/60" lean={20} />
        <Palm className="absolute right-0 -bottom-2 h-[50%] text-palm/50" lean={-12} />
        <div className="relative flex flex-col items-center gap-3">
          <p className="font-heading text-4xl tracking-wide text-white">{name}</p>
          <p className="max-w-sm text-sm text-white/80">Non ha ancora creato il suo personaggio.</p>
        </div>
      </div>
    </SheetFrame>
  );
}

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
