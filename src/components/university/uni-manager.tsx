"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarRange, ChevronDown, Dices, GraduationCap, Pencil, Plus, Save, Send, Settings2, Trash2, X } from "lucide-react";
import { inputClass } from "@/components/admin/admin-ui";
import { SettingRow } from "@/components/admin/settings-manager";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { AcademicTerm, Course, CoursePrerequisite, GameSetting, TermStudent } from "@/lib/types";
import { EFFORT_LABEL, EXAM_LABEL, STATUS_LABEL, TERM_STATUS_LABEL, grade } from "@/lib/university";
import { cn } from "@/lib/utils";

// Gestione → Università: semestri (iscrizioni, simulazione, pubblicazione),
// catalogo dei corsi, corsi obbligatori degli indirizzi, impostazioni.

type Tab = "semestri" | "corsi" | "indirizzi" | "impostazioni";
const TABS: { key: Tab; label: string; icon: typeof BookOpen }[] = [
  { key: "semestri", label: "Semestri", icon: CalendarRange },
  { key: "corsi", label: "Corsi", icon: BookOpen },
  { key: "indirizzi", label: "Indirizzi", icon: GraduationCap },
  { key: "impostazioni", label: "Impostazioni", icon: Settings2 },
];
const LETTERS = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-"];
const termLabel = (t: Pick<AcademicTerm, "academic_year" | "semester">) =>
  t.semester === "fall" ? `Fall ${t.academic_year.slice(0, 4)}` : `Spring ${Number(t.academic_year.slice(0, 4)) + 1}`;

export function UniversityManager({ settings }: { settings: GameSetting[] }) {
  const [tab, setTab] = useState<Tab>("semestri");
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-1 rounded-full bg-white/5 p-1" aria-label="Sezioni dell'università">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm", tab === key ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>
      {tab === "semestri" && <Terms />}
      {tab === "corsi" && <Courses />}
      {tab === "indirizzi" && <Majors />}
      {tab === "impostazioni" && (
        <ul className="flex flex-col gap-3">
          {settings.map((s) => (
            <SettingRow key={s.key} setting={s} levels={[]} />
          ))}
        </ul>
      )}
    </div>
  );
}

function useRpc() {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      const { data, error: e } = await supabase.rpc(fn, args);
      setBusy(false);
      if (e) {
        setError(e.message);
        return null;
      }
      return (data ?? true) as unknown;
    },
    [supabase],
  );
  return { supabase, busy, error, setError, run };
}

/* ------------------------------ Semestri ------------------------------ */

function Terms() {
  const { supabase, busy, error, run } = useRpc();
  const [terms, setTerms] = useState<AcademicTerm[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("academic_terms").select("*").order("created_at", { ascending: false });
    setTerms((data ?? []) as AcademicTerm[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  if (!terms) return <p className="text-sm text-muted-foreground">Carico…</p>;
  const open = terms.find((t) => t.status !== "published") ?? null;
  const past = terms.filter((t) => t.status === "published");

  async function act(fn: string, args: Record<string, unknown>, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    await run(fn, args);
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-xl bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}
      {open ? (
        <section className="glass flex flex-col gap-3 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-2xl tracking-wide">{termLabel(open)}</h3>
            <span className="rounded-full bg-peach/20 px-2.5 py-0.5 text-xs text-peach">{TERM_STATUS_LABEL[open.status]}</span>
          </div>
          <ol className="flex flex-wrap gap-1 text-xs text-muted-foreground">
            {(["registration_open", "in_progress", "simulated", "published"] as const).map((s, i) => (
              <li key={s} className={cn("rounded-full px-2 py-0.5", open.status === s ? "bg-flamingo/30 text-white" : "bg-white/5")}>
                {i + 1}. {TERM_STATUS_LABEL[s]}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {open.status === "registration_open" && (
              <Button type="button" disabled={busy} onClick={() => act("academic_term_set_status", { p_term: open.id, p_status: "in_progress" }, "Chiudere le iscrizioni e iniziare il semestre?")} className="rounded-full">
                Chiudi le iscrizioni
              </Button>
            )}
            {open.status === "in_progress" && (
              <>
                <Button type="button" disabled={busy} onClick={() => act("academic_simulate", { p_term: open.id }, "Lanciare gli esami di tutti gli iscritti? I dadi si tirano una volta sola.")} className="rounded-full">
                  <Dices /> Simula gli esami
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => act("academic_term_set_status", { p_term: open.id, p_status: "registration_open" })} className="rounded-full">
                  Riapri le iscrizioni
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => act("academic_term_withdraw", { p_term: open.id, p_open: !open.withdraw_open })} className="rounded-full">
                  {open.withdraw_open ? "Chiudi i ritiri (W)" : "Riapri i ritiri (W)"}
                </Button>
              </>
            )}
            {open.status === "simulated" && (
              <Button type="button" disabled={busy} onClick={() => act("academic_publish", { p_term: open.id }, "Pubblicare i risultati? Gli studenti riceveranno la pagella.")} className="rounded-full">
                <Send /> Pubblica i risultati
              </Button>
            )}
            {(open.status === "registration_open" || open.status === "in_progress") && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => act("academic_term_delete", { p_term: open.id }, "Eliminare il semestre e tutte le sue iscrizioni?")} className="ml-auto rounded-full text-destructive">
                <Trash2 /> Elimina
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {open.status === "registration_open" && "I giocatori scelgono i corsi dalla Scheda → Università. Puoi già dare bonus o malus qui sotto."}
            {open.status === "in_progress" && `Ritiri (W) ${open.withdraw_open ? "consentiti" : "chiusi"}. Ultimi bonus/malus, poi simula: i risultati restano visibili solo allo staff finché non li pubblichi.`}
            {open.status === "simulated" && "Esami svolti: rivedi i voti qui sotto, poi pubblica."}
          </p>
          <TermStudents termId={open.id} editable={open.status === "registration_open" || open.status === "in_progress"} key={`${open.id}-${open.status}`} />
        </section>
      ) : (
        <NewTerm last={terms[0] ?? null} busy={busy} onCreate={(y, s) => act("academic_term_create", { p_year: y, p_semester: s })} />
      )}

      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-heading text-xl tracking-wide text-peach">Semestri pubblicati</h3>
          {past.map((t) => (
            <div key={t.id} className="glass rounded-2xl">
              <button type="button" onClick={() => setViewing(viewing === t.id ? null : t.id)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left" aria-expanded={viewing === t.id}>
                <span className="font-heading text-lg tracking-wide">{termLabel(t)}</span>
                <span className="text-xs text-muted-foreground">pubblicato il {t.published_at ? new Date(t.published_at).toLocaleDateString("it-IT") : "—"}</span>
                <ChevronDown className={cn("ml-auto size-4 transition-transform", viewing === t.id && "rotate-180")} />
              </button>
              {viewing === t.id && (
                <div className="px-4 pb-4">
                  <TermStudents termId={t.id} editable={false} />
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function NewTerm({ last, busy, onCreate }: { last: AcademicTerm | null; busy: boolean; onCreate: (year: string, sem: string) => void }) {
  // propone il semestre successivo all'ultimo
  const next = (() => {
    if (!last) {
      const y = new Date().getFullYear();
      return { year: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, sem: "fall" };
    }
    if (last.semester === "fall") return { year: last.academic_year, sem: "spring" };
    const y = Number(last.academic_year.slice(0, 4)) + 1;
    return { year: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, sem: "fall" };
  })();
  const [year, setYear] = useState(next.year);
  const [sem, setSem] = useState(next.sem);
  return (
    <section className="glass flex flex-col gap-3 rounded-2xl p-4">
      <h3 className="font-heading text-2xl tracking-wide">Nuovo semestre</h3>
      <p className="text-sm text-muted-foreground">Aprendo il semestre si aprono le iscrizioni ai corsi e tutti i giocatori ricevono un avviso di SISTEMA.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Anno accademico
          <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026-27" className={cn(inputClass, "w-32")} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Semestre
          <select value={sem} onChange={(e) => setSem(e.target.value)} className={cn(inputClass, "w-36")}>
            <option value="fall">Fall (primo)</option>
            <option value="spring">Spring (secondo)</option>
          </select>
        </label>
        <Button type="button" disabled={busy || !/^\d{4}-\d{2}$/.test(year)} onClick={() => onCreate(year, sem)} className="h-10 rounded-full">
          <Plus /> Apri le iscrizioni
        </Button>
      </div>
    </section>
  );
}

/** Gli studenti del semestre: corsi, bonus/malus del Master, voti e tiri */
function TermStudents({ termId, editable }: { termId: string; editable: boolean }) {
  const { busy, error, run } = useRpc();
  const [students, setStudents] = useState<TermStudent[] | null>(null);
  const load = useCallback(async () => {
    const data = await run("academic_term_view", { p_term: termId });
    setStudents((Array.isArray(data) ? data : []) as TermStudent[]);
  }, [run, termId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  if (!students) return <p className="text-sm text-muted-foreground">Carico gli studenti…</p>;
  if (students.length === 0) return <p className="text-sm text-muted-foreground">Ancora nessuno studente iscritto.</p>;
  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">{students.length} studenti</p>
      {students.map((s) => (
        <StudentCard key={s.character_id} s={s} editable={editable} busy={busy} onModifier={async (id, v, note) => {
          await run("academic_set_modifier", { p_enrollment: id, p_value: v, p_note: note });
          await load();
        }} />
      ))}
    </div>
  );
}

function StudentCard({ s, editable, busy, onModifier }: { s: TermStudent; editable: boolean; busy: boolean; onModifier: (id: number, v: number, note: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const courses = s.courses ?? [];
  const credits = courses.filter((c) => c.status !== "withdrawn").reduce((t, c) => t + c.credits, 0);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm" aria-expanded={open}>
        <strong>{s.name}</strong>
        <span className="text-xs text-muted-foreground">
          {credits} crediti{courses[0] ? ` · impegno ${EFFORT_LABEL[courses[0].effort].toLowerCase()}` : ""}
          {s.record ? ` · ${STATUS_LABEL[s.record.academic_status]}` : ""}
        </span>
        {s.report && <span className="text-xs text-lavender">{s.report.report_text}</span>}
        <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="flex flex-col gap-1 px-3 pb-3">
          {courses.map((c) => (
            <EnrollmentRow key={c.id} c={c} editable={editable && c.status === "enrolled"} busy={busy} onModifier={onModifier} />
          ))}
          {courses.length === 0 && <li className="text-xs text-muted-foreground">Nessun corso (rientro dalla sospensione).</li>}
        </ul>
      )}
    </div>
  );
}

function EnrollmentRow({ c, editable, busy, onModifier }: { c: TermStudent["courses"] extends (infer T)[] | null ? T : never; editable: boolean; busy: boolean; onModifier: (id: number, v: number, note: string) => Promise<void> }) {
  const [value, setValue] = useState(c.master_modifier ?? 0);
  const [note, setNote] = useState(c.master_note ?? "");
  const [rolls, setRolls] = useState(false);
  const changed = value !== (c.master_modifier ?? 0) || note !== (c.master_note ?? "");
  return (
    <li className="rounded-lg bg-night/30 px-2 py-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 shrink-0 font-mono text-xs text-lavender">{c.code}</span>
        <span className={cn("min-w-0 flex-1 truncate", c.status === "withdrawn" && "text-muted-foreground line-through")}>{c.name}</span>
        {c.is_retake && <span className="text-xs text-peach">ripetizione</span>}
        {c.status === "completed" && (
          <button type="button" onClick={() => setRolls(!rolls)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {c.final_score} <strong className={cn("font-heading text-base", c.letter_grade === "F" ? "text-destructive" : "text-mint")}>{grade(c.letter_grade)}</strong>
            <ChevronDown className={cn("size-3.5", rolls && "rotate-180")} />
          </button>
        )}
        {c.status === "withdrawn" && <span className="text-xs font-semibold">W</span>}
      </div>
      {editable && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            Bonus/malus
            <input type="number" min={-3} max={3} value={value} onChange={(e) => setValue(Number(e.target.value))} className="h-8 w-16 rounded-lg border border-input bg-night/40 px-2" />
          </label>
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Nota (es. ha studiato in giocata)" className="h-8 min-w-40 flex-1 rounded-lg border border-input bg-night/40 px-2" />
          <Button type="button" size="xs" disabled={busy || !changed} onClick={() => onModifier(c.id, value, note)} className="rounded-full">
            <Save /> Salva
          </Button>
        </div>
      )}
      {!editable && c.master_modifier ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Master {c.master_modifier > 0 ? "+" : ""}
          {c.master_modifier}
          {c.master_note ? ` · ${c.master_note}` : ""}
        </p>
      ) : null}
      {rolls && (
        <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {c.rolls.map((r) => (
            <p key={r.type} className={cn(r.crit === "success" && "text-mint", r.crit === "failure" && "text-destructive")}>
              {EXAM_LABEL[r.type]}: {r.attr} + {r.skill} + d10 {r.crit === "none" ? r.d10 : `[${r.d10} → ${r.crit === "success" ? "+" : "−"}${r.extra}]`}
              {r.mods.totale ? ` ${r.mods.totale > 0 ? "+" : "−"} ${Math.abs(r.mods.totale)}` : ""} = {r.total} vs CD {r.cd} → {r.score}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}

/* ------------------------------ Catalogo dei corsi ------------------------------ */

type Lookup = { attrs: { id: string; code: string; name: string }[]; skills: { id: string; name: string; attribute_id: string }[] };

function useCatalog() {
  const supabase = useMemo(() => createClient(), []);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [prereqs, setPrereqs] = useState<CoursePrerequisite[]>([]);
  const [lookup, setLookup] = useState<Lookup>({ attrs: [], skills: [] });
  const load = useCallback(async () => {
    const [c, p, a, s] = await Promise.all([
      supabase.from("courses").select("*").order("code"),
      supabase.from("course_prerequisites").select("*"),
      supabase.from("attributes").select("id, code, name").order("sort_order"),
      supabase.from("skills").select("id, name, attribute_id").order("name"),
    ]);
    setCourses((c.data ?? []) as Course[]);
    setPrereqs((p.data ?? []) as CoursePrerequisite[]);
    setLookup({ attrs: (a.data ?? []) as Lookup["attrs"], skills: (s.data ?? []) as Lookup["skills"] });
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);
  return { supabase, courses, prereqs, lookup, load };
}

function Courses() {
  const { supabase, courses, prereqs, lookup, load } = useCatalog();
  const [editing, setEditing] = useState<Course | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!courses) return <p className="text-sm text-muted-foreground">Carico…</p>;
  const departments = [...new Set(courses.map((c) => c.department))].sort();
  const codeOf = new Map(courses.map((c) => [c.id, c.code]));
  const attrCode = new Map(lookup.attrs.map((a) => [a.id, a.code]));
  const skillName = new Map(lookup.skills.map((s) => [s.id, s.name]));

  async function remove(c: Course) {
    if (!window.confirm(`Eliminare ${c.code}? Se qualcuno l'ha già seguito, disattivalo invece di eliminarlo.`)) return;
    const { error: e } = await supabase.from("courses").delete().eq("id", c.id);
    if (e) setError(e.code === "23503" ? `${c.code} è già nelle pagelle di qualcuno: disattivalo invece di eliminarlo.` : e.message);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-xl bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}
      {editing ? (
        <CourseForm
          course={editing === "new" ? null : editing}
          courses={courses}
          prereqs={prereqs}
          lookup={lookup}
          departments={departments}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      ) : (
        <Button type="button" onClick={() => setEditing("new")} className="w-fit rounded-full">
          <Plus /> Nuovo corso
        </Button>
      )}
      {departments.map((d) => (
        <section key={d}>
          <h3 className="mb-1 font-heading text-xl tracking-wide text-peach">{d || "Senza dipartimento"}</h3>
          <ul className="glass divide-y divide-white/10 overflow-hidden rounded-2xl">
            {courses
              .filter((c) => c.department === d)
              .map((c) => {
                const pre = prereqs.filter((p) => p.course_id === c.id);
                return (
                  <li key={c.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2 text-sm", !c.active && "opacity-50")}>
                    <span className="w-20 shrink-0 font-mono text-xs text-lavender">{c.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.credits} cr · {c.level} · {attrCode.get(c.attribute_id)}
                        {c.skill_id ? ` + ${skillName.get(c.skill_id)}` : ""}
                        {c.cd_modifier ? ` · CD ${c.cd_modifier > 0 ? "+" : ""}${c.cd_modifier}` : ""}
                        {pre.length > 0 && ` · richiede ${pre.map((p) => `${codeOf.get(p.prerequisite_id)} (${grade(p.min_grade)})`).join(", ")}`}
                        {!c.active && " · disattivato"}
                      </span>
                    </span>
                    <button type="button" onClick={() => setEditing(c)} className="rounded p-1.5 text-muted-foreground hover:text-foreground" aria-label={`Modifica ${c.code}`}>
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" onClick={() => remove(c)} className="rounded p-1.5 text-muted-foreground hover:text-destructive" aria-label={`Elimina ${c.code}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CourseForm({
  course,
  courses,
  prereqs,
  lookup,
  departments,
  onDone,
}: {
  course: Course | null;
  courses: Course[];
  prereqs: CoursePrerequisite[];
  lookup: Lookup;
  departments: string[];
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({
    code: course?.code ?? "",
    name: course?.name ?? "",
    department: course?.department ?? departments[0] ?? "",
    credits: course?.credits ?? 3,
    level: course?.level ?? 100,
    attribute_id: course?.attribute_id ?? lookup.attrs[0]?.id ?? "",
    skill_id: course?.skill_id ?? "",
    cd_modifier: course?.cd_modifier ?? 0,
    description: course?.description ?? "",
    active: course?.active ?? true,
  });
  const [pre, setPre] = useState(prereqs.filter((p) => p.course_id === course?.id).map((p) => ({ id: p.prerequisite_id, min: p.min_grade })));
  const [addPre, setAddPre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    setError(null);
    const row = { ...f, code: f.code.trim().toUpperCase(), name: f.name.trim(), department: f.department.trim(), skill_id: f.skill_id || null };
    const res = course
      ? await supabase.from("courses").update(row).eq("id", course.id).select("id").single<{ id: string }>()
      : await supabase.from("courses").insert(row).select("id").single<{ id: string }>();
    if (res.error) {
      setBusy(false);
      return setError(res.error.code === "23505" ? "Esiste già un corso con questo codice." : res.error.message);
    }
    const id = res.data.id;
    // prerequisiti: si riscrivono
    await supabase.from("course_prerequisites").delete().eq("course_id", id);
    if (pre.length) {
      const { error: e } = await supabase.from("course_prerequisites").insert(pre.map((p) => ({ course_id: id, prerequisite_id: p.id, min_grade: p.min })));
      if (e) {
        setBusy(false);
        return setError(e.message);
      }
    }
    setBusy(false);
    onDone();
  }

  const label = "flex flex-col gap-1 text-xs";
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4">
      <p className="font-heading text-xl tracking-wide text-peach">{course ? `Modifica ${course.code}` : "Nuovo corso"}</p>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className={label}>
          Codice
          <input value={f.code} maxLength={12} onChange={(e) => set("code", e.target.value)} placeholder="CHEM 101" className={inputClass} />
        </label>
        <label className={cn(label, "sm:col-span-3")}>
          Nome
          <input value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} className={inputClass} />
        </label>
        <label className={cn(label, "sm:col-span-2")}>
          Dipartimento
          <input value={f.department} maxLength={60} list="uni-dipartimenti" onChange={(e) => set("department", e.target.value)} className={inputClass} />
          <datalist id="uni-dipartimenti">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <label className={label}>
          Crediti
          <input type="number" min={1} max={6} value={f.credits} onChange={(e) => set("credits", Number(e.target.value))} className={inputClass} />
        </label>
        <label className={label}>
          Livello
          <select value={f.level} onChange={(e) => set("level", Number(e.target.value) as Course["level"])} className={inputClass}>
            {[100, 200, 300, 400].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Caratteristica
          <select value={f.attribute_id} onChange={(e) => set("attribute_id", e.target.value)} className={inputClass}>
            {lookup.attrs.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={cn(label, "sm:col-span-2")}>
          Abilità
          <select value={f.skill_id} onChange={(e) => set("skill_id", e.target.value)} className={inputClass}>
            <option value="">Nessuna (solo caratteristica)</option>
            {lookup.skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Modificatore CD
          <input type="number" min={-5} max={5} value={f.cd_modifier} onChange={(e) => set("cd_modifier", Number(e.target.value))} className={inputClass} />
        </label>
        <label className={cn(label, "sm:col-span-4")}>
          Descrizione
          <input value={f.description} maxLength={500} onChange={(e) => set("description", e.target.value)} className={inputClass} />
        </label>
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        <span>Prerequisiti (voto minimo)</span>
        <div className="flex flex-wrap gap-1.5">
          {pre.map((p) => (
            <span key={p.id} className="flex items-center gap-1 rounded-full bg-white/10 py-0.5 pr-1 pl-2.5">
              {courses.find((c) => c.id === p.id)?.code}
              <select value={p.min} onChange={(e) => setPre((x) => x.map((y) => (y.id === p.id ? { ...y, min: e.target.value } : y)))} className="rounded bg-transparent text-xs" aria-label="Voto minimo">
                {LETTERS.map((l) => (
                  <option key={l} value={l}>
                    {grade(l)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setPre((x) => x.filter((y) => y.id !== p.id))} className="rounded-full p-0.5 hover:bg-destructive/30" aria-label="Togli">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <select
            value={addPre}
            onChange={(e) => {
              if (e.target.value) setPre((x) => [...x, { id: e.target.value, min: "C-" }]);
              setAddPre("");
            }}
            className="h-7 rounded-full border border-input bg-night/40 px-2"
            aria-label="Aggiungi un prerequisito"
          >
            <option value="">+ prerequisito…</option>
            {courses
              .filter((c) => c.id !== course?.id && !pre.some((p) => p.id === c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Attivo (si può scegliere alle iscrizioni)
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} className="rounded-full">
          <X /> Annulla
        </Button>
        <Button type="button" disabled={busy || !f.code.trim() || !f.name.trim()} onClick={save} className="rounded-full">
          <Save /> Salva
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ Corsi obbligatori degli indirizzi ------------------------------ */

function Majors() {
  const { supabase, courses, load: loadCourses } = useCatalog();
  const [majors, setMajors] = useState<{ id: string; name: string }[]>([]);
  const [req, setReq] = useState<{ major_id: string; course_id: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [m, r] = await Promise.all([
      supabase.from("sheet_options").select("id, name").eq("kind", "indirizzo").eq("active", true).order("sort_order"),
      supabase.from("major_required_courses").select("major_id, course_id"),
    ]);
    setMajors((m.data ?? []) as { id: string; name: string }[]);
    setReq((r.data ?? []) as { major_id: string; course_id: string }[]);
  }, [supabase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lettura all'apertura
    load();
  }, [load]);

  async function add(major: string, course: string) {
    setError(null);
    const { error: e } = await supabase.from("major_required_courses").insert({ major_id: major, course_id: course });
    if (e) setError(e.message);
    load();
    loadCourses();
  }
  async function remove(major: string, course: string) {
    setError(null);
    const { error: e } = await supabase.from("major_required_courses").delete().eq("major_id", major).eq("course_id", course);
    if (e) setError(e.message);
    load();
  }

  if (!courses) return <p className="text-sm text-muted-foreground">Carico…</p>;
  const byId = new Map(courses.map((c) => [c.id, c]));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Gli indirizzi sono quelli della scheda (Gestione → Elenchi della scheda). Per laurearsi servono i crediti, il GPA minimo e tutti questi corsi con almeno C−. Mettete anche i prerequisiti dei corsi obbligatori, così nessuno resta bloccato.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {majors.map((m) => {
        const mine = req.filter((r) => r.major_id === m.id).map((r) => byId.get(r.course_id)).filter((c): c is Course => !!c).sort((a, b) => a.level - b.level || a.code.localeCompare(b.code));
        return (
          <section key={m.id} className="glass flex flex-col gap-2 rounded-2xl p-3">
            <h3 className="font-heading text-xl tracking-wide">{m.name}</h3>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {mine.length === 0 && <span className="text-muted-foreground">Nessun corso obbligatorio.</span>}
              {mine.map((c) => (
                <span key={c.id} className="flex items-center gap-1 rounded-full bg-white/10 py-0.5 pr-1 pl-2.5" title={c.name}>
                  {c.code}
                  <button type="button" onClick={() => remove(m.id, c.id)} className="rounded-full p-0.5 hover:bg-destructive/30" aria-label={`Togli ${c.code}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <select value="" onChange={(e) => e.target.value && add(m.id, e.target.value)} className="h-7 rounded-full border border-input bg-night/40 px-2" aria-label={`Aggiungi un corso obbligatorio a ${m.name}`}>
                <option value="">+ corso…</option>
                {courses
                  .filter((c) => c.active && !mine.some((x) => x.id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </section>
        );
      })}
    </div>
  );
}
