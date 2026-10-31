import type { AcademicStatus, ClassStanding, Effort, ExamRoll, TermReport, TermStatus } from "@/lib/types";
import { firstName } from "@/lib/format";

// Testi e calcoli dell'università condivisi da scheda e gestione.
// Le regole e i numeri stanno nel database (game_settings uni_*): qui solo la presentazione.

export const CLASS_LABEL: Record<ClassStanding, string> = { freshman: "Freshman", sophomore: "Sophomore", junior: "Junior", senior: "Senior" };
export const STATUS_LABEL: Record<AcademicStatus, string> = {
  good_standing: "Good Standing",
  probation: "Academic Probation",
  suspended: "Academic Suspension",
  dismissed: "Academic Dismissal",
  graduated: "Laureato",
};
export const TERM_STATUS_LABEL: Record<TermStatus, string> = {
  registration_open: "Iscrizioni aperte",
  in_progress: "Semestre in corso",
  simulated: "Esami svolti, in revisione",
  published: "Risultati pubblicati",
};
export const EFFORT_LABEL: Record<Effort, string> = { minimal: "Minimo", normal: "Normale", intense: "Intenso" };
export const EXAM_LABEL: Record<ExamRoll["type"], string> = { coursework: "Coursework", midterm: "Midterm", final: "Final" };

/** "B-" → "B−" */
export const grade = (g: string | null | undefined) => (g ? g.replace("-", "−") : "—");
export const gpa = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Number(n).toFixed(2));

/** Grade points di un voto in lettere (scala US) */
export const GRADE_POINTS: Record<string, number> = { A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0 };

/** Il tiro come nella specifica: "INT 8 + Scienze 6 + d10 [10 → +7] + 2 = 33 vs CD 12 → 100" */
export function rollText(r: ExamRoll, attrCode: string, skillName: string | null) {
  const die =
    r.crit === "success" ? `d10 [${r.d10} → +${r.extra}]` : r.crit === "failure" ? `d10 [${r.d10} → −${r.extra}]` : `d10 ${r.d10}`;
  const mods = r.mods.totale ? ` ${r.mods.totale > 0 ? "+" : "−"} ${Math.abs(r.mods.totale)}` : "";
  const voci = (r.mods.voci ?? []).filter((v) => v.value !== 0).map((v) => `${v.name} ${v.value > 0 ? "+" : "−"}${Math.abs(v.value)}`);
  const cool = r.mods.sangue_freddo ? ` (Sangue freddo: ritirato il ${r.mods.sangue_freddo})` : "";
  return `${attrCode} ${r.attr} + ${skillName ?? "abilità"} ${r.skill} + ${die}${cool}${mods} = ${r.total} vs CD ${r.cd} → ${r.score}${voci.length ? ` · ${voci.join(", ")}` : ""}`;
}

/** Pagella breve da incollare in chat */
export function chatReport(opts: {
  label: string;
  name: string;
  classStanding: ClassStanding;
  major: string | null;
  courses: { code: string; letter_grade: string | null; status: string }[];
  report: TermReport | null;
}) {
  const { label, name, classStanding, major, courses, report } = opts;
  const lines = [`📜 ${label} – ${firstName(name)} (${CLASS_LABEL[classStanding]}${major ? `, ${major}` : ""})`];
  lines.push(courses.map((c) => `${c.code} – ${c.status === "withdrawn" ? "W" : grade(c.letter_grade)}`).join(" | "));
  if (report) {
    lines.push(`GPA semestre ${gpa(report.term_gpa)} · Cumulativo ${gpa(report.cumulative_gpa_after)} · ${report.credits_total_after} crediti`);
    if (report.deans_list) lines.push("⭐ Dean's List");
    if (report.graduated) lines.push(`🎓 Laurea${report.honors ? ` ${report.honors}` : ""}`);
    else if (report.standing_after !== "good_standing") lines.push(`⚠️ ${STATUS_LABEL[report.standing_after]}`);
  }
  return lines.join("\n");
}
