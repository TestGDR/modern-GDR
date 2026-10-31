"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, BookOpen, Check, ChevronDown, ClipboardCopy, GraduationCap, NotebookPen, Plus, Search, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { AcademicOverview, Course, CoursePrerequisite, Effort, EnrollmentView, Homework } from "@/lib/types";
import {
  CLASS_LABEL,
  EFFORT_LABEL,
  EXAM_LABEL,
  STATUS_LABEL,
  TERM_STATUS_LABEL,
  chatReport,
  gpa,
  grade,
  rollText,
} from "@/lib/university";
import { cn } from "@/lib/utils";

// Scheda → Università: carriera, iscrizione ai corsi, transcript e pagelle.
// Tutto passa dalle funzioni del database (academic_*): qui si sceglie e si mostra.

type Catalog = {
  courses: Course[];
  prereqs: CoursePrerequisite[];
  attrs: Record<string, string>;
  skills: Record<string, string>;
  settings: Record<string, number | number[]>;
};

export function StudentPanel({ characterId, isOwner }: { characterId: string; isOwner: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<AcademicOverview | null | "vietato">(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [lastHomework, setLastHomework] = useState<string | null>(null);
  // ora dell'ultimo caricamento, per sapere se il prossimo compito si può già fare
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const [{ data: o, error: e }, { data: h }] = await Promise.all([
      supabase.rpc("academic_overview", { p_character: characterId }),
      supabase.rpc("academic_homework_list", { p_character: characterId }),
    ]);
    if (e) return setData("vietato");
    setData(o as AcademicOverview);
    setHomework((h ?? []) as Homework[]);
    setNow(Date.now());
  }, [supabase, characterId]);

  // fa un compito e mostra subito com'è andato
  async function doHomework(enrollment: EnrollmentView) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setLastHomework(null);
    const { data: r, error: e } = await supabase.rpc("academic_homework", { p_enrollment: enrollment.id });
    setBusy(false);
    if (e) setError(e.message);
    else {
      const h = r as { total: number; cd: number; points: number; crit: string };
      const result =
        h.points > 0 ? `riuscito, +${h.points} punt${h.points === 1 ? "o" : "i"} sul voto` : h.total >= h.cd ? "riuscito, ma hai già il massimo dei punti" : "non riuscito";
      const crit = h.crit === "success" ? " (successo critico!)" : h.crit === "failure" ? " (fallimento critico)" : "";
      setLastHomework(`Compito di ${enrollment.code}: ${h.total} contro CD ${h.cd} → ${result}${crit}.`);
    }
    await load();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura della sezione
    load();
    Promise.all([
      supabase.from("courses").select("*").eq("active", true).order("code"),
      supabase.from("course_prerequisites").select("*"),
      supabase.from("attributes").select("id, code"),
      supabase.from("skills").select("id, name"),
      supabase.from("game_settings").select("key, value").like("key", "uni_%"),
    ]).then(([c, p, a, s, g]) =>
      setCatalog({
        courses: (c.data ?? []) as Course[],
        prereqs: (p.data ?? []) as CoursePrerequisite[],
        attrs: Object.fromEntries(((a.data ?? []) as { id: string; code: string }[]).map((x) => [x.id, x.code])),
        skills: Object.fromEntries(((s.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])),
        settings: Object.fromEntries(((g.data ?? []) as { key: string; value: number | number[] }[]).map((x) => [x.key, x.value])),
      }),
    );
  }, [load, supabase]);

  async function run(fn: string, args: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    if (e) setError(e.message);
    await load();
  }

  if (data === null) return <p className="text-sm text-muted-foreground">Carico…</p>;
  if (data === "vietato") return <p className="text-sm text-muted-foreground">Non hai i permessi necessari.</p>;
  if (data.character.status !== "approvata") return <p className="text-sm text-muted-foreground">La carriera universitaria inizia dopo l&apos;approvazione della scheda.</p>;

  const { record, term } = data;
  const byId = new Map((catalog?.courses ?? []).map((c) => [c.id, c]));
  const status = record.academic_status;
  const canAct = isOwner && !data.character.graduate && !["suspended", "dismissed", "graduated"].includes(status);

  return (
    <div className="flex flex-col gap-6">
      <StatusCard data={data} required={num(catalog?.settings.uni_crediti_laurea, 120)} />
      {error && <p className="rounded-xl bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}

      {data.character.graduate ? (
        <p className="text-sm text-muted-foreground">I Graduate (magistrale) non seguono i corsi undergraduate.</p>
      ) : term ? (
        <section className="flex flex-col gap-3">
          <h3 className="flex flex-wrap items-baseline gap-2 font-heading text-xl tracking-wide text-peach">
            {term.label}
            <span className="font-sans text-xs tracking-normal text-muted-foreground">{TERM_STATUS_LABEL[term.status]}</span>
          </h3>
          {status === "suspended" && <p className="text-sm text-destructive">Sei in sospensione accademica: salti questo semestre.</p>}
          {term.status === "registration_open" && canAct && catalog ? (
            <Registration data={data} catalog={catalog} busy={busy} run={run} />
          ) : (
            <>
              {lastHomework && <p className="rounded-xl bg-mint/15 px-3 py-2 text-sm text-mint">{lastHomework}</p>}
              <CurrentCourses
                data={data}
                canWithdraw={isOwner && term.status === "in_progress" && term.withdraw_open}
                homework={term.status === "in_progress" ? homework : []}
                homeworkRules={catalog?.settings}
                now={now}
                onHomework={isOwner && term.status === "in_progress" ? doHomework : null}
                busy={busy}
                run={run}
              />
            </>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Nessun semestre aperto: le iscrizioni le apre lo staff.</p>
      )}

      <Transcript data={data} byId={byId} catalog={catalog} homework={homework} />
    </div>
  );
}

/* ------------------------------ Stato dello studente ------------------------------ */

function StatusCard({ data, required }: { data: AcademicOverview; required: number }) {
  const { record } = data;
  const items = [
    { label: "Anno", value: CLASS_LABEL[record.class_standing] },
    { label: "Major", value: data.character.major ?? "—" },
    { label: "Crediti", value: `${record.credits_earned} / ${required}` },
    { label: "GPA cumulativo", value: gpa(record.cumulative_gpa) },
  ];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-violet/30 via-dusk/40 to-flamingo/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <GraduationCap className="size-5 text-peach" />
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            record.academic_status === "good_standing" || record.academic_status === "graduated" ? "bg-mint/20 text-mint" : "bg-destructive/20 text-destructive",
          )}
        >
          {STATUS_LABEL[record.academic_status]}
        </span>
        {record.honors && <span className="rounded-full bg-peach/20 px-2.5 py-0.5 text-xs font-semibold text-peach">{record.honors}</span>}
        {record.new && <span className="text-xs text-muted-foreground">Carriera non ancora iniziata: parte alla prima iscrizione.</span>}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((i) => (
          <div key={i.label}>
            <dt className="text-[0.7rem] tracking-wider text-muted-foreground uppercase">{i.label}</dt>
            <dd className="font-heading text-2xl leading-tight tracking-wide">{i.value}</dd>
          </div>
        ))}
      </dl>
      <div className="h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={required} aria-valuenow={record.credits_earned} aria-label="Crediti verso la laurea">
        <div className="h-full rounded-full bg-gradient-to-r from-flamingo to-peach" style={{ width: `${Math.min(100, (record.credits_earned / required) * 100)}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------ Iscrizione ------------------------------ */

const num = (v: number | number[] | undefined, d: number) => (typeof v === "number" ? v : d);
const list = (v: number | number[] | undefined) => (Array.isArray(v) ? v : []);

function Registration({
  data,
  catalog,
  busy,
  run,
}: {
  data: AcademicOverview;
  catalog: Catalog;
  busy: boolean;
  run: (fn: string, args: Record<string, unknown>) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("");
  const term = data.term!;
  const s = catalog.settings;
  const mine = data.current.filter((e) => e.status !== "withdrawn");
  const credits = mine.reduce((t, e) => t + e.credits, 0);
  const effort: Effort = mine[0]?.effort ?? "normal";
  const max = effort === "intense" ? num(s.uni_crediti_max_intenso, 15) : num(s.uni_crediti_max, 18);
  const min = num(s.uni_crediti_min, 12);
  const reqPoints = num(s.uni_voto_minimo_requisiti, 1.7);
  const block = num(s.uni_blocco_livelli, 1) === 1;
  const standing = data.record.class_standing;
  const required = new Set(data.required);
  const codeOf = new Map(catalog.courses.map((c) => [c.id, c.code]));
  const minPoints: Record<string, number> = { A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7 };
  const effortMods = list(s.uni_impegno);

  // perché non ci si può iscrivere (null = si può)
  function blocked(c: Course): string | null {
    if (mine.some((e) => e.course_id === c.id)) return "Iscritto";
    const last = data.passed[c.id];
    if (last !== undefined && last >= reqPoints) return "Superato";
    if (block && c.level === 300 && standing !== "junior" && standing !== "senior") return "Da Junior";
    if (block && c.level === 400 && standing !== "senior") return "Da Senior";
    const missing = catalog.prereqs.filter((p) => p.course_id === c.id && (data.passed[p.prerequisite_id] ?? -1) < (minPoints[p.min_grade] ?? 1.7));
    if (missing.length) return `Serve ${missing.map((p) => codeOf.get(p.prerequisite_id)).join(", ")}`;
    if (credits + c.credits > max) return "Crediti";
    return null;
  }

  const departments = [...new Set(catalog.courses.map((c) => c.department))].sort();
  const q = query.trim().toLowerCase();
  const shown = catalog.courses.filter((c) => (!dept || c.department === dept) && (!q || `${c.code} ${c.name}`.toLowerCase().includes(q)));

  return (
    <div className="flex flex-col gap-4">
      {/* I miei corsi del semestre */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <strong>I tuoi corsi</strong>
          <span className={cn("rounded-full px-2 py-0.5 text-xs", credits >= min && credits <= max ? "bg-mint/20 text-mint" : "bg-peach/20 text-peach")}>
            {credits} crediti · full-time da {min} a {max}
          </span>
          <label className="ml-auto flex items-center gap-2 text-xs">
            Impegno
            <select
              value={effort}
              disabled={busy || mine.length === 0}
              onChange={(e) => run("academic_set_effort", { p_term: term.id, p_character: data.character.id, p_effort: e.target.value })}
              className="h-8 rounded-lg border border-input bg-night/40 px-2 outline-none"
            >
              {(["minimal", "normal", "intense"] as Effort[]).map((x, i) => (
                <option key={x} value={x}>
                  {EFFORT_LABEL[x]} ({(effortMods[i] ?? 0) > 0 ? "+" : ""}
                  {effortMods[i] ?? 0})
                </option>
              ))}
            </select>
          </label>
        </div>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ancora nessun corso: sceglili dall&apos;elenco qui sotto.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {mine.map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-lg bg-night/30 px-2 py-1.5 text-sm">
                <span className="w-20 shrink-0 font-mono text-xs text-lavender">{e.code}</span>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                {e.is_retake && <span className="text-xs text-peach">ripetizione</span>}
                <span className="text-xs text-muted-foreground">{e.credits} cr</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run("academic_drop", { p_term: term.id, p_character: data.character.id, p_course: e.course_id })}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  aria-label={`Togli ${e.code}`}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Oltre i {num(s.uni_carico_pesante_oltre, 15)} crediti il carico pesante toglie {num(s.uni_carico_pesante_malus, 1)} a tutti i tiri; con l&apos;impegno intenso si arriva al massimo a {num(s.uni_crediti_max_intenso, 15)}. A iscrizioni chiuse si potrà solo ritirare un corso (W).
        </p>
      </div>

      {/* Catalogo */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca un corso…" aria-label="Cerca un corso" className="h-9 w-full rounded-lg border border-input bg-night/40 pr-2 pl-8 text-sm outline-none focus-visible:border-ring" />
          </label>
          <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Dipartimento" className="h-9 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none">
            <option value="">Tutti i dipartimenti</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
          {shown.map((c) => {
            const why = blocked(c);
            return (
              <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
                <span className="w-20 shrink-0 font-mono text-xs text-lavender">{c.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {c.name}
                    {required.has(c.id) && <span className="ml-1.5 rounded bg-flamingo/25 px-1 text-[0.65rem] text-flamingo uppercase">obbligatorio</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.credits} cr · {c.level} · {catalog.attrs[c.attribute_id]}
                    {c.skill_id ? ` + ${catalog.skills[c.skill_id]}` : ""}
                  </span>
                </span>
                {why ? (
                  <span className={cn("shrink-0 text-xs", why === "Iscritto" || why === "Superato" ? "text-mint" : "text-muted-foreground")}>{why}</span>
                ) : (
                  <Button type="button" size="xs" disabled={busy} onClick={() => run("academic_enroll", { p_term: term.id, p_character: data.character.id, p_course: c.id })} className="rounded-full">
                    <Plus /> Iscriviti
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Semestre in corso (o in revisione): i miei corsi, con il ritiro */
function CurrentCourses({
  data,
  canWithdraw,
  homework,
  homeworkRules,
  now,
  onHomework,
  busy,
  run,
}: {
  data: AcademicOverview;
  canWithdraw: boolean;
  homework: Homework[];
  homeworkRules: Catalog["settings"] | undefined;
  now: number;
  onHomework: ((e: EnrollmentView) => void) | null;
  busy: boolean;
  run: (fn: string, args: Record<string, unknown>) => Promise<void>;
}) {
  if (data.current.length === 0) return <p className="text-sm text-muted-foreground">Non sei iscritto a nessun corso in questo semestre.</p>;
  const maxHw = num(homeworkRules?.uni_compiti_max, 3);
  const maxPts = num(homeworkRules?.uni_compiti_punti_max, 3);
  const days = num(homeworkRules?.uni_compiti_giorni, 7);
  return (
    <div className="flex flex-col gap-2">
      {onHomework && (
        <p className="text-xs text-muted-foreground">
          Compiti: fino a {maxHw} per corso, uno ogni {days} giorni. Un compito riuscito vale +1 punto sul voto del corso (+{num(homeworkRules?.uni_compiti_punti_critico, 2)} con un 10 naturale), al massimo +{maxPts}.
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {data.current.map((e) => {
          const mine = homework.filter((h) => h.enrollment_id === e.id);
          const pts = Math.min(maxPts, mine.reduce((t, h) => t + h.points, 0));
          const last = mine.at(-1);
          const nextAt = last ? new Date(Date.parse(last.created_at) + days * 86_400_000) : null;
          return (
        <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-sm">
          <span className="w-20 shrink-0 font-mono text-xs text-lavender">{e.code}</span>
          <span className={cn("min-w-0 flex-1 truncate", e.status === "withdrawn" && "text-muted-foreground line-through")}>{e.name}</span>
          <span className="text-xs text-muted-foreground">{e.credits} cr</span>
          {e.status === "withdrawn" ? (
            <span className="text-xs font-semibold text-muted-foreground">W</span>
          ) : (
            canWithdraw &&
            e.status === "enrolled" && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() => window.confirm(`Ritirarti da ${e.code}? In pagella comparirà W: niente crediti, non pesa sul GPA.`) && run("academic_withdraw", { p_enrollment: e.id })}
                className="rounded-full"
              >
                <Undo2 /> Ritira (W)
              </Button>
            )
          )}
          {onHomework && e.status === "enrolled" && (
            <span className="flex w-full items-center gap-2 text-xs text-muted-foreground sm:pl-[5.5rem]">
              <NotebookPen className="size-3.5 text-peach" />
              Compiti {mine.length}/{maxHw}
              {pts > 0 && <strong className="text-mint">+{pts}</strong>}
              {mine.length > 0 && <span className="truncate">· {mine.map((h) => (h.points > 0 ? `✓${h.points > 1 ? h.points : ""}` : "✗")).join(" ")}</span>}
              {mine.length >= maxHw ? (
                <span className="ml-auto">fatti tutti</span>
              ) : nextAt && nextAt.getTime() > now ? (
                <span className="ml-auto">prossimo dal {nextAt.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>
              ) : (
                <Button type="button" size="xs" disabled={busy} onClick={() => onHomework(e)} className="ml-auto rounded-full">
                  <NotebookPen /> Fai un compito
                </Button>
              )}
            </span>
          )}
        </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------ Transcript e pagelle ------------------------------ */

function Transcript({ data, byId, catalog, homework }: { data: AcademicOverview; byId: Map<string, Course>; catalog: Catalog | null; homework: Homework[] }) {
  if (data.history.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-heading text-xl tracking-wide text-peach">
        <BookOpen className="size-5" /> Transcript
      </h3>
      {[...data.history].reverse().map((h) => (
        <TermCard key={h.term_id} data={data} term={h} byId={byId} catalog={catalog} homework={homework} />
      ))}
    </section>
  );
}

function TermCard({
  data,
  term,
  byId,
  catalog,
  homework,
}: {
  data: AcademicOverview;
  term: AcademicOverview["history"][number];
  byId: Map<string, Course>;
  catalog: Catalog | null;
  homework: Homework[];
}) {
  const [copied, setCopied] = useState(false);
  const r = term.report;

  async function copy() {
    const text = chatReport({
      label: term.label,
      name: data.character.name,
      classStanding: r?.class_standing_after ?? data.record.class_standing,
      major: data.character.major,
      courses: term.courses,
      report: r,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia la pagella:", text);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <p className="font-heading text-lg tracking-wide">{term.label}</p>
        {term.status === "simulated" && <span className="rounded-full bg-orchid/25 px-2 py-0.5 text-[0.7rem] text-orchid">Anteprima staff</span>}
        {r?.deans_list && (
          <span className="flex items-center gap-1 rounded-full bg-peach/20 px-2 py-0.5 text-xs text-peach">
            <Award className="size-3.5" /> Dean&apos;s List
          </span>
        )}
        {r?.graduated && <span className="rounded-full bg-mint/20 px-2 py-0.5 text-xs text-mint">🎓 Laurea{r.honors ? ` ${r.honors}` : ""}</span>}
        <Button type="button" size="xs" variant="ghost" onClick={copy} className="ml-auto rounded-full">
          {copied ? <Check /> : <ClipboardCopy />} {copied ? "Copiata" : "Copia per la chat"}
        </Button>
      </header>
      {r && (
        <p className="px-4 pt-2 text-xs text-muted-foreground">
          GPA del semestre <strong className="text-foreground">{gpa(r.term_gpa)}</strong> · Cumulativo <strong className="text-foreground">{gpa(r.cumulative_gpa_after)}</strong> ·{" "}
          {r.credits_total_after} crediti · {CLASS_LABEL[r.class_standing_after]}
          {r.standing_after !== r.standing_before && ` · ${STATUS_LABEL[r.standing_before]} → ${STATUS_LABEL[r.standing_after]}`}
        </p>
      )}
      <ul className="flex flex-col p-2">
        {term.courses.map((c) => (
          <CourseRow key={c.id} c={c} course={byId.get(c.course_id)} catalog={catalog} homework={homework.filter((h) => h.enrollment_id === c.id)} />
        ))}
      </ul>
    </article>
  );
}

function CourseRow({ c, course, catalog, homework }: { c: EnrollmentView; course: Course | undefined; catalog: Catalog | null; homework: Homework[] }) {
  const [open, setOpen] = useState(false);
  const attr = course && catalog ? catalog.attrs[course.attribute_id] : "Car.";
  const skill = course?.skill_id && catalog ? catalog.skills[course.skill_id] : null;
  const failed = c.letter_grade === "F";
  const weights = list(catalog?.settings.uni_pesi_prove);
  const hwPoints = Math.min(num(catalog?.settings.uni_compiti_punti_max, 3), homework.reduce((t, h) => t + h.points, 0));
  return (
    <li className="rounded-lg">
      <button
        type="button"
        onClick={() => c.rolls.length > 0 && setOpen(!open)}
        className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", c.rolls.length > 0 && "hover:bg-white/5")}
        aria-expanded={open}
      >
        <span className="w-20 shrink-0 font-mono text-xs text-lavender">{c.code}</span>
        <span className="min-w-0 flex-1 truncate">
          {c.name}
          {c.is_retake && <span className="ml-1.5 text-xs text-peach">ripetuto</span>}
          {c.counts_in_gpa === false && c.status === "completed" && <span className="ml-1.5 text-xs text-muted-foreground">(sostituito)</span>}
        </span>
        <span className="text-xs text-muted-foreground">{c.credits} cr</span>
        <span className={cn("w-10 text-right font-heading text-lg", failed ? "text-destructive" : c.status === "withdrawn" ? "text-muted-foreground" : "text-mint")}>
          {c.status === "withdrawn" ? "W" : grade(c.letter_grade)}
        </span>
        {c.rolls.length > 0 && <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />}
      </button>
      {open && (
        <div className="mx-2 mb-2 flex flex-col gap-1 rounded-lg bg-night/40 p-2.5 text-xs">
          {homework.map((h, i) => (
            <p key={h.id} className={cn(h.crit === "success" && "text-mint", h.crit === "failure" && "text-destructive")}>
              <strong className="text-foreground">Compito {i + 1}:</strong> {attr} {h.attr} + {skill ?? "abilità"} {h.skill} + d10{" "}
              {h.crit === "success" ? `[${h.d10} → +${h.extra}]` : h.crit === "failure" ? `[${h.d10} → −${h.extra}]` : h.d10}
              {h.mods ? ` ${h.mods > 0 ? "+" : "−"} ${Math.abs(h.mods)}` : ""} = {h.total} vs CD {h.cd} →{" "}
              {h.points > 0 ? `+${h.points}` : h.total >= h.cd ? "riuscito (tetto raggiunto)" : "non riuscito"}
            </p>
          ))}
          {c.rolls.map((r) => (
            <p key={r.type} className={cn(r.crit === "success" && "text-mint", r.crit === "failure" && "text-destructive")}>
              <strong className="text-foreground">{EXAM_LABEL[r.type]}:</strong> {rollText(r, attr, skill)}
              {r.crit === "success" && " · successo critico"}
              {r.crit === "failure" && " · fallimento critico"}
            </p>
          ))}
          <p className="text-muted-foreground">
            Punteggio del corso: <strong className="text-foreground">{c.final_score}</strong>
            {hwPoints > 0 && ` (di cui +${hwPoints} dai compiti)`} (coursework {weights[0] ?? 20}%, midterm {weights[1] ?? 30}%, final {weights[2] ?? 50}%)
            {c.rolls[0] && (
              <>
                {" "}· Modificatori: impegno {c.rolls[0].mods.impegno}, carico {c.rolls[0].mods.carico}, voci della scheda {c.rolls[0].mods.voci ? "(per prova, sopra)" : c.rolls[0].mods.tratti}, ripetizione {c.rolls[0].mods.ripetizione}, Master {c.rolls[0].mods.master}
                {c.rolls[0].mods.nota_master && ` (“${c.rolls[0].mods.nota_master}”)`}
              </>
            )}
          </p>
        </div>
      )}
    </li>
  );
}
