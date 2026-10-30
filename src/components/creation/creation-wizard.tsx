"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleAlert, Loader2, Pencil, Send } from "lucide-react";
import { SheetFrame, type SheetVariant } from "@/components/game/character-sheet-window";
import { Button } from "@/components/ui/button";
import { saveCreation, submitCharacter, type CreationPatch } from "@/lib/actions/creation";
import type { CharacterBuild, RulesData } from "@/lib/data";
import {
  attributePointsUsed,
  birthDateFor,
  findAnomalies,
  formatBirthDate,
  maxesLabel,
  MONTHS,
  pxSummary,
  respectsMaxes,
  skillCost,
  traitCounts,
  type Build,
  type InterlockSettings,
} from "@/lib/interlock";
import type { Character, CreationOption } from "@/lib/types";
import { formatDollars } from "@/lib/bank";
import { cn } from "@/lib/utils";

const STEPS = ["Anagrafica", "Caratteristiche", "Scelte", "Abilità", "Background", "Riepilogo"];
const SEX_LABELS = { M: "Maschile", F: "Femminile", X: "Non binario" } as const;
// Schede del passaggio Scelte: le voci divise per livello (generali, ambientazione, provenienza)
type OptionTab = "tenore" | "vantaggi" | "svantaggi" | "tratti" | "ambientazione" | "provenienza";
const OPTION_TABS: { key: OptionTab; title: string; hint: string; filter: (o: CreationOption) => boolean }[] = [
  { key: "tenore", title: "Patrimonio", hint: "Una sola scelta.", filter: (o) => o.kind === "tenore" },
  { key: "vantaggi", title: "Vantaggi", hint: "Capacità o circostanze favorevoli: costano PX.", filter: (o) => o.kind === "vantaggio" && o.scope !== "ambientazione" },
  { key: "svantaggi", title: "Svantaggi", hint: "Debolezze o complicazioni: danno PX.", filter: (o) => o.kind === "svantaggio" && o.scope !== "ambientazione" },
  { key: "tratti", title: "Tratti", hint: "Carattere: un pro e un contro.", filter: (o) => o.kind === "tratto" && !o.is_origin && o.scope !== "ambientazione" },
  { key: "ambientazione", title: "Ambientazione", hint: "Legami, risorse, ruoli e privilegi narrativi: non cambiano i tiri.", filter: (o) => o.scope === "ambientazione" && !o.is_origin },
  { key: "provenienza", title: "Provenienza", hint: "Da dove vieni: un punto di partenza per il Master (una sola).", filter: (o) => o.is_origin },
];
const SUBGROUP_LABEL: Record<string, string> = { legami: "Legami", risorse: "Risorse e luoghi", ruoli: "Ruoli e reputazione", interpretativo: "Interpretativi" };

type State = Build & {
  clubId: string | null;
  appearance: string;
  traits: string;
  bio: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

type CreationWizardProps = {
  character: Character;
  build: CharacterBuild;
  rules: RulesData;
  settings: InterlockSettings;
  variant: SheetVariant;
};

/** Creazione del personaggio in 6 passaggi, con salvataggio automatico */
export function CreationWizard({ character, build, rules, settings, variant }: CreationWizardProps) {
  const [step, setStep] = useState(Math.min(Math.max(character.creation_step, 1), 6));
  const [maxReached, setMaxReached] = useState(character.creation_step);
  const [state, setState] = useState<State>(() => initialState(character, build, rules, settings));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const pending = useRef<CreationPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------- Salvataggio automatico ------------------------- */

  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    setStatus("saving");
    const result = await saveCreation(character.id, patch);
    setStatus(result.ok ? "saved" : "error");
    setMessage(result.error ?? null);
  }

  function queue(patch: CreationPatch) {
    const p = pending.current;
    pending.current = {
      ...p,
      ...patch,
      attributes: patch.attributes ? { ...p.attributes, ...patch.attributes } : p.attributes,
      skills: patch.skills ? { ...p.skills, ...patch.skills } : p.skills,
    };
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }

  async function goTo(next: number) {
    const target = Math.min(Math.max(next, 1), 6);
    const reached = Math.max(maxReached, target);
    if (reached > maxReached) {
      setMaxReached(reached);
      pending.current = { ...pending.current, step: reached };
    }
    setStep(target);
    await flush();
  }

  /* ------------------------------ Modifiche ------------------------------ */

  function updateProfile(changes: Partial<Pick<State, "sex" | "age" | "birthDay" | "birthMonth" | "nationality">>) {
    const next = { ...state, ...changes };
    setState(next);
    queue({
      profile: {
        sex: next.sex as "M" | "F" | "X" | null,
        age: next.age,
        birthDay: next.birthDay,
        birthMonth: next.birthMonth,
        nationality: next.nationality,
      },
    });
  }

  function setAttribute(id: string, value: number) {
    setState((s) => ({ ...s, attributes: { ...s.attributes, [id]: value } }));
    // la prima volta si salvano tutte (anche quelle rimaste al minimo)
    queue({ attributes: { ...state.attributes, [id]: value } });
  }

  function toggleOption(option: CreationOption, single: boolean) {
    let ids = state.optionIds;
    if (single) {
      // una sola nel gruppo: patrimonio, oppure provenienza
      const sameGroup = (o: CreationOption | undefined) => !!o && (option.is_origin ? o.is_origin : o.kind === option.kind);
      ids = [...ids.filter((id) => !sameGroup(rules.options.find((o) => o.id === id))), option.id];
    } else {
      ids = ids.includes(option.id) ? ids.filter((id) => id !== option.id) : [...ids, option.id];
    }
    setState((s) => ({ ...s, optionIds: ids }));
    queue({ optionIds: ids, optionDetails: state.optionDetails });
  }

  // livello (Contatti 1–3, Fobia lieve/grave…) e scelta (l'oggetto della fobia, il dipartimento…)
  function setOptionDetail(id: string, change: Partial<{ level: number; choice: string }>) {
    const details = { ...state.optionDetails, [id]: { ...(state.optionDetails[id] ?? { level: 1, choice: "" }), ...change } };
    setState((s) => ({ ...s, optionDetails: details }));
    queue({ optionIds: state.optionIds, optionDetails: details });
  }

  function setSkill(id: string, level: number) {
    setState((s) => ({ ...s, skills: { ...s.skills, [id]: level } }));
    queue({ skills: { [id]: level } });
  }

  function updateBackground(changes: Partial<Pick<State, "studyTrackId" | "yearId" | "clubId" | "appearance" | "traits" | "bio">>) {
    const next = { ...state, ...changes };
    setState(next);
    queue({
      background: {
        studyTrackId: next.studyTrackId,
        yearId: next.yearId,
        clubId: next.clubId,
        appearance: next.appearance,
        traits: next.traits,
        bio: next.bio,
      },
    });
  }

  /* ------------------------------ Calcoli ------------------------------ */

  const chosen = rules.options.filter((o) => state.optionIds.includes(o.id));
  const px = pxSummary(chosen, state.skills, settings, state.optionDetails);
  const anomalies = findAnomalies(state, rules, settings);
  const attrValues = rules.attributes.map((a) => state.attributes[a.id] ?? settings.attrMinCreation);
  const pointsUsed = attributePointsUsed(attrValues);
  const attributesOk = pointsUsed === settings.attrPoints && respectsMaxes(attrValues, settings);
  const canGoNext = step !== 2 || attributesOk;

  function submit() {
    startSubmit(async () => {
      await flush();
      const result = await submitCharacter(character.id);
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error ?? "Invio non riuscito.");
      }
    });
  }

  /* ------------------------------ Interfaccia ------------------------------ */

  return (
    <SheetFrame title={`Crea il personaggio · ${character.name}`} variant={variant}>
      {/* Barra di avanzamento */}
      <nav className="shrink-0 border-b border-white/10 px-3 py-2.5" aria-label="Passaggi della creazione">
        <ol className="flex gap-1 overflow-x-auto">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const reachable = n <= maxReached || n <= step;
            const hasIssue = anomalies.some((a) => a.step === n);
            return (
              <li key={label} className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => goTo(n)}
                  aria-current={n === step ? "step" : undefined}
                  className="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-1 disabled:opacity-40"
                >
                  <span
                    className={cn(
                      "h-1.5 w-full rounded-full",
                      n < step ? "bg-flamingo" : n === step ? "bg-gradient-to-r from-flamingo to-peach" : "bg-white/15",
                    )}
                  />
                  <span className={cn("flex items-center gap-1 text-[0.65rem] tracking-wide uppercase", n === step ? "text-white" : "text-muted-foreground")}>
                    {n}
                    <span className="hidden @lg:inline">· {label}</span>
                    {hasIssue && n < step && <CircleAlert className="size-3 text-peach" aria-label="Da sistemare" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {character.status === "rifiutata" && character.rejection_reason && (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <strong>Scheda rifiutata:</strong> {character.rejection_reason}
        </div>
      )}

      {/* Contenuto del passaggio */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <h2 className="mb-1 font-heading text-3xl tracking-wide text-sunset">
          {step}. {STEPS[step - 1]}
        </h2>
        {step !== 6 && (
          <StepIssues anomalies={anomalies.filter((a) => a.step === step)} show={step < maxReached || step === 2} />
        )}

        {step === 1 && <StepProfile state={state} settings={settings} name={character.name} onChange={updateProfile} />}
        {step === 2 && (
          <StepAttributes state={state} rules={rules} settings={settings} pointsUsed={pointsUsed} onChange={setAttribute} />
        )}
        {step === 3 && <StepOptions state={state} rules={rules} settings={settings} remaining={px.remaining} onToggle={toggleOption} onDetail={setOptionDetail} />}
        {step === 4 && <StepSkills state={state} rules={rules} settings={settings} remaining={px.remaining} onChange={setSkill} />}
        {step === 5 && <StepBackground state={state} rules={rules} onChange={updateBackground} />}
        {step === 6 && (
          <StepSummary
            state={state}
            rules={rules}
            settings={settings}
            px={px}
            anomalies={anomalies}
            onEdit={goTo}
            name={character.name}
          />
        )}
      </div>

      {/* Piè di pagina: navigazione e stato del salvataggio */}
      <footer className="flex shrink-0 items-center gap-2 border-t border-white/10 px-3 py-2.5">
        <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 1}>
          <ChevronLeft /> Indietro
        </Button>
        <div className="flex min-w-0 flex-1 flex-col items-center text-center text-xs">
          {(step === 3 || step === 4 || step === 6) && (
            <span className={cn("font-semibold", px.remaining < 0 ? "text-destructive" : "text-mint")}>
              PX disponibili: {px.remaining}
            </span>
          )}
          <SaveIndicator status={status} message={message} />
        </div>
        {step < 6 ? (
          <Button type="button" onClick={() => goTo(step + 1)} disabled={!canGoNext} className="rounded-full">
            Avanti <ChevronRight />
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={anomalies.length > 0 || submitting} className="rounded-full">
            {submitting ? <Loader2 className="animate-spin" /> : <Send />} Invia
          </Button>
        )}
      </footer>
    </SheetFrame>
  );
}

/* ------------------------------ Stato iniziale ------------------------------ */

function initialState(character: Character, build: CharacterBuild, rules: RulesData, settings: InterlockSettings): State {
  const [, month, day] = (character.birth_date ?? "").split("-").map(Number);
  const attributes: Record<string, number> = {};
  for (const a of rules.attributes) attributes[a.id] = build.attributes[a.id] ?? settings.attrMinCreation;
  return {
    sex: character.sex,
    age: character.age,
    birthDay: day || null,
    birthMonth: month || null,
    nationality: character.nationality ?? "",
    attributes,
    optionIds: build.optionIds,
    optionDetails: build.optionDetails ?? {},
    skills: build.skills,
    studyTrackId: character.study_track_id,
    yearId: character.year_id,
    clubId: character.club_id,
    appearance: character.appearance ?? "",
    traits: character.traits ?? "",
    bio: character.bio ?? "",
  };
}

/* ------------------------------ Elementi comuni ------------------------------ */

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function SaveIndicator({ status, message }: { status: SaveStatus; message: string | null }) {
  if (message) {
    return (
      <span className={cn("flex items-center gap-1", status === "error" ? "text-destructive" : "text-peach")}>
        <AlertTriangle className="size-3 shrink-0" /> {message}
      </span>
    );
  }
  if (status === "saving") return <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Salvataggio…</span>;
  if (status === "saved") return <span className="flex items-center gap-1 text-muted-foreground"><Check className="size-3" /> Salvato</span>;
  return <span className="text-muted-foreground">Ogni modifica si salva da sola</span>;
}

function StepIssues({ anomalies, show }: { anomalies: { message: string }[]; show: boolean }) {
  if (!show || anomalies.length === 0) return <div className="mb-4" />;
  return (
    <ul className="mt-2 mb-4 flex flex-col gap-1 rounded-xl border border-peach/30 bg-peach/10 px-3 py-2 text-sm text-peach">
      {anomalies.map((a) => (
        <li key={a.message} className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {a.message}
        </li>
      ))}
    </ul>
  );
}

function sheetOptions(rules: RulesData, kind: "indirizzo" | "anno" | "club") {
  return rules.sheetOptions.filter((o) => o.kind === kind);
}

/* ------------------------------ 1. Anagrafica ------------------------------ */

function StepProfile({
  state,
  settings,
  name,
  onChange,
}: {
  state: State;
  settings: InterlockSettings;
  name: string;
  onChange: (c: Partial<Pick<State, "sex" | "age" | "birthDay" | "birthMonth" | "nationality">>) => void;
}) {
  const ages = Array.from({ length: settings.ageMax - settings.ageMin + 1 }, (_, i) => settings.ageMin + i);
  const birth = state.age && state.birthDay && state.birthMonth ? birthDateFor(state.age, state.birthDay, state.birthMonth, settings) : null;
  const birthYear = state.age ? settings.gameYear - state.age : null;

  return (
    <div className="grid max-w-xl gap-4">
      <div className="rounded-xl bg-white/5 px-4 py-3">
        <p className="text-xs text-muted-foreground">Nome e cognome (scelti alla registrazione)</p>
        <p className="font-heading text-2xl tracking-wide">{name}</p>
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Sesso</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SEX_LABELS) as (keyof typeof SEX_LABELS)[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ sex: key })}
              aria-pressed={state.sex === key}
              className={cn(
                "rounded-full border px-4 py-2 transition-colors",
                state.sex === key ? "border-flamingo bg-flamingo/20 text-white" : "border-white/15 text-muted-foreground hover:text-foreground",
              )}
            >
              {SEX_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <Field label="Età" hint={`Studenti di college: da ${settings.ageMin} a ${settings.ageMax} anni.`}>
        <select className={selectClass} value={state.age ?? ""} onChange={(e) => onChange({ age: e.target.value ? Number(e.target.value) : null })}>
          <option value="">— Scegli —</option>
          {ages.map((a) => (
            <option key={a} value={a}>
              {a} anni
            </option>
          ))}
        </select>
      </Field>

      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Giorno e mese di nascita</span>
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <select className={selectClass} value={state.birthDay ?? ""} onChange={(e) => onChange({ birthDay: e.target.value ? Number(e.target.value) : null })} aria-label="Giorno">
            <option value="">Giorno</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select className={selectClass} value={state.birthMonth ?? ""} onChange={(e) => onChange({ birthMonth: e.target.value ? Number(e.target.value) : null })} aria-label="Mese">
            <option value="">Mese</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <span className="text-xs text-muted-foreground">
          {birthYear ? `Anno di nascita: ${birthYear} (anno di gioco ${settings.gameYear} − ${state.age} anni). ` : "Scegli l'età: l'anno di nascita si calcola da solo. "}
          {birth ? (
            <strong className="text-mint">Nato/a il {formatBirthDate(birth)}</strong>
          ) : state.birthDay && state.birthMonth && state.age ? (
            <strong className="text-destructive">Questa data non esiste nel {birthYear}.</strong>
          ) : null}
        </span>
      </div>

      <Field label="Nazionalità" hint="Scrivila tu, es. Cubana, Italo-americana, Statunitense.">
        <input
          type="text"
          className={selectClass}
          maxLength={60}
          value={state.nationality}
          onChange={(e) => onChange({ nationality: e.target.value })}
          placeholder="Es. Cubana"
        />
      </Field>
    </div>
  );
}

/* ------------------------------ 2. Caratteristiche ------------------------------ */

function StepAttributes({
  state,
  rules,
  settings,
  pointsUsed,
  onChange,
}: {
  state: State;
  rules: RulesData;
  settings: InterlockSettings;
  pointsUsed: number;
  onChange: (id: string, value: number) => void;
}) {
  const range = Array.from({ length: settings.attrMax - settings.attrMinCreation + 1 }, (_, i) => settings.attrMinCreation + i);
  const values = rules.attributes.map((a) => state.attributes[a.id] ?? settings.attrMinCreation);
  const maxesOk = respectsMaxes(values, settings);
  const left = settings.attrPoints - pointsUsed;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm @md:grid-cols-2">
        <p>
          Punti usati:{" "}
          <strong className={left === 0 ? "text-mint" : left < 0 ? "text-destructive" : "text-peach"}>
            {pointsUsed} / {settings.attrPoints}
          </strong>
          {left > 0 && <span className="text-muted-foreground"> (ne restano {left})</span>}
          {left < 0 && <span className="text-destructive"> ({-left} di troppo)</span>}
        </p>
        <p className={maxesOk ? "text-muted-foreground" : "text-destructive"}>
          Massimi consentiti, dal più alto: <strong>{maxesLabel(settings)}</strong>
        </p>
        <p className="text-xs text-muted-foreground @md:col-span-2">
          Ogni caratteristica va da {settings.attrMinCreation} a {settings.attrMax}. Una persona comune ha circa 5. Dopo l&apos;approvazione
          non si cambiano più.
        </p>
      </div>
      <ul className="grid gap-3 @lg:grid-cols-2">
        {rules.attributes.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-night/30 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-heading text-xl tracking-wide">
                <span className="text-peach">{a.code}</span> · {a.name}
              </p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
            </div>
            <select
              className={cn(selectClass, "w-20 shrink-0 text-center text-base font-semibold")}
              value={state.attributes[a.id] ?? settings.attrMinCreation}
              onChange={(e) => onChange(a.id, Number(e.target.value))}
              aria-label={a.name}
            >
              {range.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {!(left === 0 && maxesOk) && (
        <p className="text-sm text-muted-foreground">Per andare avanti spendi tutti i punti rispettando i massimali.</p>
      )}
    </div>
  );
}

/* ------------------------------ 3. Scelte ------------------------------ */

function StepOptions({
  state,
  rules,
  settings,
  remaining,
  onToggle,
  onDetail,
}: {
  state: State;
  rules: RulesData;
  settings: InterlockSettings;
  remaining: number;
  onToggle: (o: CreationOption, single: boolean) => void;
  onDetail: (id: string, change: Partial<{ level: number; choice: string }>) => void;
}) {
  const [tab, setTab] = useState<OptionTab>("tenore");
  const nameOf = (id: string) => rules.options.find((o) => o.id === id)?.name;
  const chosen = rules.options.filter((o) => state.optionIds.includes(o.id));
  const counts = traitCounts(chosen, settings);
  const current = OPTION_TABS.find((t) => t.key === tab) ?? OPTION_TABS[0];
  const single = tab === "tenore" || tab === "provenienza";
  // le voci non ancora disponibili si vedono solo se già scelte (per poterle togliere)
  const items = rules.options.filter((o) => current.filter(o) && (o.available || state.optionIds.includes(o.id)));
  const groups = tab === "ambientazione"
    ? [
        ...["legami", "risorse", "ruoli", "interpretativo"].map((g) => ({ title: `Vantaggi · ${SUBGROUP_LABEL[g]}`, items: items.filter((o) => o.kind === "vantaggio" && o.subgroup === g) })),
        { title: "Svantaggi", items: items.filter((o) => o.kind === "svantaggio" && o.subgroup !== "interpretativo") },
        { title: "Svantaggi · Interpretativi", items: items.filter((o) => o.kind === "svantaggio" && o.subgroup === "interpretativo") },
      ]
    : [{ title: "", items }];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Un vantaggio, un tratto o un patrimonio costa PX; uno svantaggio ne dà. Ti restano{" "}
        <strong className={remaining < 0 ? "text-destructive" : "text-mint"}>{remaining} PX</strong> per le abilità.
      </p>
      {/* contatori dei massimi */}
      <p className="flex flex-wrap gap-1.5 text-[0.7rem]">
        {counts.filter(([, n]) => n > 0).map(([label, n, max]) => (
          <span key={label} className={cn("rounded-full px-2 py-0.5", n > max ? "bg-destructive/20 text-destructive" : "bg-white/10")}>
            {label} {n}/{max}
          </span>
        ))}
      </p>
      <nav className="flex flex-wrap gap-1 rounded-2xl bg-white/5 p-1" aria-label="Gruppi di voci">
        {OPTION_TABS.map((t) => {
          const n = rules.options.filter((o) => t.filter(o) && state.optionIds.includes(o.id)).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn("rounded-full px-3 py-1.5 text-xs", tab === t.key ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
            >
              {t.title}
              {n > 0 && <span className="ml-1 text-peach">{n}</span>}
            </button>
          );
        })}
      </nav>
      <p className="text-xs text-muted-foreground">{current.hint}</p>
      {groups.map((group) =>
        group.items.length === 0 ? null : (
          <section key={group.title || "voci"}>
            {group.title && <h3 className="mb-2 font-heading text-lg tracking-wide text-peach">{group.title}</h3>}
            <ul className="grid gap-2 @lg:grid-cols-2">
              {group.items.map((o) => {
                const selected = state.optionIds.includes(o.id);
                const blockedBy = o.incompatible_ids.find((id) => state.optionIds.includes(id)) ??
                  rules.options.find((x) => state.optionIds.includes(x.id) && x.incompatible_ids.includes(o.id))?.id;
                const disabled = !selected && !!blockedBy;
                const detail = state.optionDetails[o.id] ?? { level: 1, choice: "" };
                const cost = o.cost_px * (selected ? detail.level : 1);
                return (
                  <li key={o.id} className={cn("rounded-xl border transition-colors", selected ? "border-flamingo bg-flamingo/15" : "border-white/10 bg-night/30")}>
                    <button
                      type="button"
                      onClick={() => onToggle(o, single)}
                      disabled={disabled}
                      aria-pressed={selected}
                      className="flex w-full items-start gap-3 p-3 text-left disabled:opacity-40"
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center border",
                          single ? "rounded-full" : "rounded-md",
                          selected ? "border-flamingo bg-flamingo text-primary-foreground" : "border-white/30",
                        )}
                      >
                        {selected && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">
                            {o.name}
                            {o.secret_default && <span className="ml-1.5 text-[0.65rem] text-orchid">segreto</span>}
                          </span>
                          <span className={cn("shrink-0 text-xs font-semibold", cost > 0 ? "text-peach" : cost < 0 ? "text-mint" : "text-muted-foreground")}>
                            {cost > 0 ? `−${cost}` : cost < 0 ? `+${-cost}` : "0"} PX{o.max_level > 1 && !selected ? " a livello" : ""}
                          </span>
                        </span>
                        {o.description && <span className="block text-xs text-muted-foreground">{o.description}</span>}
                        {o.kind === "tenore" && (
                          <span className="block text-xs text-sand">
                            Entrata {formatDollars(o.salary)} al mese · mantenimento {formatDollars(o.upkeep)} al mese · quota iniziale {formatDollars(o.initial_amount)}
                          </span>
                        )}
                        {!o.available && <span className="block text-xs text-destructive">Non ancora disponibile: toglila.</span>}
                        {disabled && blockedBy && <span className="block text-xs text-destructive">Incompatibile con {nameOf(blockedBy)}</span>}
                      </span>
                    </button>
                    {/* livello e scelta richiesta */}
                    {selected && (o.max_level > 1 || (o.requires_choice && o.requires_choice !== "master")) && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2 text-xs">
                        {o.max_level > 1 && (
                          <span className="flex items-center gap-1">
                            Livello
                            {Array.from({ length: o.max_level }, (_, i) => i + 1).map((l) => (
                              <button
                                key={l}
                                type="button"
                                onClick={() => onDetail(o.id, { level: l })}
                                aria-pressed={detail.level === l}
                                className={cn("size-7 rounded-full border", detail.level === l ? "border-flamingo bg-flamingo text-white" : "border-white/20 hover:bg-white/10")}
                              >
                                {l}
                              </button>
                            ))}
                          </span>
                        )}
                        {o.requires_choice && o.requires_choice !== "master" && (
                          <input
                            value={detail.choice}
                            maxLength={80}
                            onChange={(e) => onDetail(o.id, { choice: e.target.value })}
                            placeholder={o.choice_hint ? `Indica ${o.choice_hint}` : "La tua scelta"}
                            aria-label={`Scelta per ${o.name}`}
                            className={cn("h-8 min-w-0 flex-1 rounded-lg border bg-night/40 px-2 outline-none", detail.choice.trim() ? "border-input" : "border-peach/60")}
                          />
                        )}
                      </div>
                    )}
                    {selected && o.requires_choice === "master" && <p className="border-t border-white/10 px-3 py-2 text-xs text-muted-foreground">I dettagli li decide il Master.</p>}
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

/* ------------------------------ 4. Abilità ------------------------------ */

function StepSkills({
  state,
  rules,
  settings,
  remaining,
  onChange,
}: {
  state: State;
  rules: RulesData;
  settings: InterlockSettings;
  remaining: number;
  onChange: (id: string, level: number) => void;
}) {
  const levels = Array.from({ length: settings.skillMax }, (_, i) => i + 1);
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Salire al livello N costa {settings.pxPerLevel} × N PX. Un&apos;abilità non supera la caratteristica collegata. I PX non spesi
        restano al personaggio.
      </p>
      {rules.attributes.map((attr) => {
        const attrValue = state.attributes[attr.id] ?? 0;
        const skills = rules.skills.filter((s) => s.attribute_id === attr.id);
        if (skills.length === 0) return null;
        return (
          <section key={attr.id}>
            <h3 className="mb-2 flex items-baseline justify-between font-heading text-xl tracking-wide">
              <span>
                <span className="text-peach">{attr.code}</span> · {attr.name}
              </span>
              <span className="text-base text-muted-foreground">valore {attrValue}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {skills.map((skill) => {
                const level = state.skills[skill.id] ?? 0;
                const over = level > attrValue;
                return (
                  <li key={skill.id} className={cn("rounded-xl border bg-night/30 px-3 py-2", over ? "border-destructive/60" : "border-white/10")}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium" title={skill.description}>
                        {skill.name}
                      </p>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        Rango <strong className="text-foreground">{attrValue + level}</strong>
                      </p>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1" role="group" aria-label={`Livello di ${skill.name}`}>
                      {levels.map((l) => {
                        const filled = l <= level;
                        // Si sale solo fino alla caratteristica, e solo se i PX bastano
                        const extra = l > level ? skillCost(l, settings) - skillCost(level, settings) : 0;
                        const disabled = l > attrValue || (l > level && extra > remaining);
                        return (
                          <button
                            key={l}
                            type="button"
                            disabled={disabled && !filled}
                            onClick={() => onChange(skill.id, l === level ? l - 1 : l)}
                            aria-label={`Livello ${l}`}
                            title={l > level ? `Costo: ${extra} PX` : `Livello ${l}`}
                            className={cn(
                              "size-6 rounded-full border transition-colors disabled:cursor-not-allowed",
                              filled ? "border-flamingo bg-gradient-to-br from-flamingo to-peach" : "border-white/25 hover:border-flamingo/70",
                              l > attrValue && "opacity-25",
                            )}
                          />
                        );
                      })}
                      {level > 0 && (
                        <button type="button" onClick={() => onChange(skill.id, 0)} className="ml-1 text-xs text-muted-foreground hover:text-foreground">
                          azzera
                        </button>
                      )}
                    </div>
                    {over && <p className="mt-1 text-xs text-destructive">Supera la caratteristica ({attrValue}): abbassa il livello.</p>}
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

/* ------------------------------ 5. Background ------------------------------ */

function StepBackground({
  state,
  rules,
  onChange,
}: {
  state: State;
  rules: RulesData;
  onChange: (c: Partial<Pick<State, "studyTrackId" | "yearId" | "clubId" | "appearance" | "traits" | "bio">>) => void;
}) {
  const area = "min-h-28 w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <div className="grid max-w-2xl gap-4">
      <div className="grid gap-4 @lg:grid-cols-3">
        <Field label="Indirizzo di studio">
          <select className={selectClass} value={state.studyTrackId ?? ""} onChange={(e) => onChange({ studyTrackId: e.target.value || null })}>
            <option value="">— Scegli —</option>
            {sheetOptions(rules, "indirizzo").map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Anno di corso">
          <select className={selectClass} value={state.yearId ?? ""} onChange={(e) => onChange({ yearId: e.target.value || null })}>
            <option value="">— Scegli —</option>
            {sheetOptions(rules, "anno").map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Squadra o club (facoltativo)">
          <select className={selectClass} value={state.clubId ?? ""} onChange={(e) => onChange({ clubId: e.target.value || null })}>
            <option value="">— Nessuno —</option>
            {sheetOptions(rules, "club").map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Aspetto" hint="Com'è fisicamente, come si veste, segni particolari.">
        <textarea className={area} maxLength={3000} value={state.appearance} onChange={(e) => onChange({ appearance: e.target.value })} />
      </Field>
      <Field label="Carattere" hint="Personalità, abitudini, pregi e difetti.">
        <textarea className={area} maxLength={3000} value={state.traits} onChange={(e) => onChange({ traits: e.target.value })} />
      </Field>
      <Field label="Storia" hint="Da dove viene e cosa l'ha portato al college.">
        <textarea className={cn(area, "min-h-40")} maxLength={5000} value={state.bio} onChange={(e) => onChange({ bio: e.target.value })} />
      </Field>
    </div>
  );
}

/* ------------------------------ 6. Riepilogo ------------------------------ */

function StepSummary({
  state,
  rules,
  settings,
  px,
  anomalies,
  onEdit,
  name,
}: {
  state: State;
  rules: RulesData;
  settings: InterlockSettings;
  px: ReturnType<typeof pxSummary>;
  anomalies: { step: number; message: string }[];
  onEdit: (step: number) => void;
  name: string;
}) {
  const optionName = (id: string | null) => rules.sheetOptions.find((o) => o.id === id)?.name ?? "—";
  const birth = state.age && state.birthDay && state.birthMonth ? birthDateFor(state.age, state.birthDay, state.birthMonth, settings) : null;
  const chosen = rules.options.filter((o) => state.optionIds.includes(o.id));
  const boughtSkills = rules.skills.filter((s) => (state.skills[s.id] ?? 0) > 0);

  return (
    <div className="flex flex-col gap-4">
      {anomalies.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <li className="font-semibold">Da sistemare prima dell&apos;invio:</li>
          {anomalies.map((a) => (
            <li key={a.message}>
              <button type="button" onClick={() => onEdit(a.step)} className="flex items-start gap-2 text-left hover:underline">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Passaggio {a.step}: {a.message}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-mint/30 bg-mint/10 px-3 py-2 text-sm text-mint">
          Tutto in regola: invia la scheda allo staff per l&apos;approvazione. Si aprirà da solo un ticket «Approvazione PG», dove lo staff ti risponderà.
        </p>
      )}

      <SummaryBlock title="Anagrafica" step={1} onEdit={onEdit}>
        <p>
          <strong>{name}</strong> · {state.sex ? SEX_LABELS[state.sex as keyof typeof SEX_LABELS] : "—"} · {state.age ?? "—"} anni
        </p>
        <p>Nato/a il {formatBirthDate(birth)} · {state.nationality.trim() || "—"}</p>
      </SummaryBlock>

      <SummaryBlock title="Caratteristiche" step={2} onEdit={onEdit}>
        <div className="flex flex-wrap gap-2">
          {rules.attributes.map((a) => (
            <span key={a.id} className="rounded-lg bg-white/5 px-2.5 py-1">
              <span className="text-peach">{a.code}</span> {state.attributes[a.id] ?? "—"}
            </span>
          ))}
        </div>
      </SummaryBlock>

      <SummaryBlock title="Scelte" step={3} onEdit={onEdit}>
        {chosen.length === 0 ? (
          <p className="text-muted-foreground">Nessuna scelta.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {chosen.map((o) => {
              const d = state.optionDetails[o.id];
              const cost = o.cost_px * (d?.level ?? 1);
              return (
                <li key={o.id} className="rounded-lg bg-white/5 px-2.5 py-1">
                  {o.name}
                  {o.max_level > 1 && ` ${d?.level ?? 1}`}
                  {d?.choice && <span className="text-lavender"> · {d.choice}</span>}{" "}
                  <span className="text-xs text-muted-foreground">({cost > 0 ? `−${cost}` : `+${-cost}`} PX)</span>
                </li>
              );
            })}
          </ul>
        )}
      </SummaryBlock>

      <SummaryBlock title="Abilità" step={4} onEdit={onEdit}>
        {boughtSkills.length === 0 ? (
          <p className="text-muted-foreground">Nessuna abilità acquistata.</p>
        ) : (
          <ul className="grid gap-1 @md:grid-cols-2">
            {boughtSkills.map((s) => {
              const level = state.skills[s.id] ?? 0;
              const attr = state.attributes[s.attribute_id] ?? 0;
              return (
                <li key={s.id} className={cn("flex justify-between gap-2", level > attr && "text-destructive")}>
                  <span>{s.name}</span>
                  <span className="text-muted-foreground">
                    {level} · rango {attr + level}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          PX: {px.start} iniziali − {px.options} scelte − {px.skills} abilità = <strong className={px.remaining < 0 ? "text-destructive" : "text-mint"}>{px.remaining}</strong>
        </p>
      </SummaryBlock>

      <SummaryBlock title="Background" step={5} onEdit={onEdit}>
        <p>
          {optionName(state.studyTrackId)} · {optionName(state.yearId)} · {state.clubId ? optionName(state.clubId) : "nessun club"}
        </p>
        {state.bio && <p className="mt-1 line-clamp-3 text-muted-foreground">{state.bio}</p>}
      </SummaryBlock>
    </div>
  );
}

function SummaryBlock({ title, step, onEdit, children }: { title: string; step: number; onEdit: (s: number) => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-night/30 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-heading text-lg tracking-wide text-peach">{title}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(step)}>
          <Pencil /> Modifica
        </Button>
      </div>
      {children}
    </section>
  );
}
