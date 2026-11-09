"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, GraduationCap, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type WorkKind = "assignment" | "paper";
type Choice = { enrollment_id: number; code: string; name: string; kind: WorkKind; cd: number; bonus: number };
type RollOption = { message_id: number; total: number; attribute: string; skill: string | null; at: string; room: string; choices: Choice[] };
type Work = { kind: WorkKind; code: string; bonus: number; total: number; cd: number; at: string };
type Options =
  | { open: false }
  | { open: true; term: string; max: number; cap: number; hours: number; assignment: number; paper: number; works: Work[]; rolls: RollOption[] };

export const WORK_LABEL: Record<WorkKind, string> = { assignment: "Assignment", paper: "Paper" };
const hour = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

/**
 * Paper e assignment: i tiri di dado fatti in chat con caratteristica e abilità di un
 * corso si registrano qui (uscendo dalla chat o dalla pagina Università).
 * Una lettura all'apertura e una scrittura per ogni registrazione, niente altro.
 * Con roomId solo i tiri di quella chat.
 */
export function AcademicWorks({ characterId, roomId = null, compact = false }: { characterId: string; roomId?: string | null; compact?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // scelta per ogni tiro: "iscrizione:tipo"
  const [pick, setPick] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const { data: d, error: e } = await supabase.rpc("academic_work_options", { p_character: characterId, p_room: roomId });
    if (e) return setError(e.message);
    setData(d as Options);
  }, [supabase, characterId, roomId]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function register(r: RollOption) {
    const chosen = pick[r.message_id] ?? (r.choices[0] ? `${r.choices[0].enrollment_id}:${r.choices[0].kind}` : "");
    const [enrollment, kind] = chosen.split(":");
    if (!enrollment || busy) return;
    setBusy(true);
    setError(null);
    const { data: c, error: e } = await supabase.rpc("academic_work_register", {
      p_character: characterId,
      p_message: r.message_id,
      p_enrollment: Number(enrollment),
      p_kind: kind,
    });
    setBusy(false);
    if (e) setError(e.message);
    else {
      const ch = c as Choice;
      setDone(`${WORK_LABEL[ch.kind]} di ${ch.code} registrato: +${ch.bonus} ai tiri d'esame del corso.`);
    }
    load();
  }

  if (!data || !data.open) return null;
  // in chat il riquadro compare solo se c'è qualcosa da registrare
  if (compact && data.rolls.length === 0) return null;

  return (
    <section className={cn("flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-left text-sm", compact && "text-xs")}>
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <GraduationCap className="size-4 text-peach" /> Registra per l&apos;università
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          Assignment {data.assignment}/{data.max} · Paper {data.paper}/{data.max}
        </span>
      </p>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Tira in chat con caratteristica e abilità di un tuo corso. Entro {data.hours} ore puoi registrare il tiro: assignment (CD del corso, +1 ai tiri d&apos;esame) o paper (CD +2, +2). Al massimo {data.max} di ogni tipo per semestre e +{data.cap} per corso.
        </p>
      )}
      {done && <p className="rounded-lg bg-mint/15 px-2 py-1 text-mint">{done}</p>}
      {error && <p className="rounded-lg bg-destructive/15 px-2 py-1 text-destructive">{error}</p>}

      {data.rolls.length === 0 ? (
        !compact && <p className="text-xs text-muted-foreground">Nessun tiro da registrare nelle ultime {data.hours} ore.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {data.rolls.map((r) => (
            <li key={r.message_id} className="flex flex-wrap items-center gap-2 rounded-xl bg-night/40 px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">
                  {r.attribute}
                  {r.skill ? ` + ${r.skill}` : ""}: {r.total}
                </span>
                <span className="block text-[0.7rem] text-muted-foreground">
                  {hour(r.at)}
                  {!roomId && ` · ${r.room}`}
                </span>
              </span>
              {r.choices.length === 0 ? (
                <span className="text-[0.7rem] text-muted-foreground">Non supera la CD o hai già il massimo</span>
              ) : (
                <>
                  <select
                    value={pick[r.message_id] ?? `${r.choices[0].enrollment_id}:${r.choices[0].kind}`}
                    onChange={(e) => setPick((p) => ({ ...p, [r.message_id]: e.target.value }))}
                    aria-label="Corso e tipo"
                    className="h-8 max-w-56 rounded-lg border border-input bg-night/40 px-2 text-xs outline-none"
                  >
                    {r.choices.map((c) => (
                      <option key={`${c.enrollment_id}:${c.kind}`} value={`${c.enrollment_id}:${c.kind}`}>
                        {WORK_LABEL[c.kind]} · {c.code} (CD {c.cd}, +{c.bonus})
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="xs" disabled={busy} onClick={() => register(r)} className="rounded-full">
                    <NotebookPen /> Registra
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!compact && data.works.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-white/10 pt-2 text-xs">
          {data.works.map((w, i) => (
            <li key={i} className="flex items-center gap-2">
              <FileText className="size-3.5 text-lavender" />
              <span className="font-mono text-lavender">{w.code}</span>
              {WORK_LABEL[w.kind]}
              <span className="text-muted-foreground">
                · {w.total} contro CD {w.cd}
              </span>
              <strong className="ml-auto text-mint">+{w.bonus}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
