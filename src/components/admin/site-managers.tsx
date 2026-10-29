"use client";

import { useState } from "react";
import { Eye, Save, Trash2 } from "lucide-react";
import { ActiveToggle, ErrorText, FieldLabel, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { previewMaintenance, runMaintenance, saveSignups, type MaintenanceKind } from "@/lib/actions/site";

/** Gestione → Iscrizioni: interruttore e messaggio (dal Westeros 0153) */
export function SignupsManager({ open, message }: { open: boolean; message: string }) {
  const [form, setForm] = useState({ open, message });
  const [saved, setSaved] = useState(false);
  const { pending, error, execute } = useAdminAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        execute(() => saveSignups(form.open, form.message), () => setSaved(true));
      }}
      className="glass flex max-w-xl flex-col gap-4 rounded-2xl p-5"
    >
      <ErrorText error={error} />
      <ActiveToggle checked={form.open} onChange={(o) => setForm({ ...form, open: o })} label={form.open ? "Iscrizioni aperte" : "Iscrizioni chiuse"} />
      <FieldLabel label="Messaggio per chi prova a iscriversi" hint="Facoltativo, es. «Lavori in corso: riapriamo lunedì». Si vede solo a iscrizioni chiuse.">
        <input className={inputClass} value={form.message} maxLength={200} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      </FieldLabel>
      <p className="text-xs text-muted-foreground">Con le iscrizioni chiuse il modulo di registrazione non compare e il database rifiuta comunque ogni nuovo account.</p>
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-mint">Salvato.</span>}
        <Button type="submit" disabled={pending} className="rounded-full">
          <Save /> Salva
        </Button>
      </div>
    </form>
  );
}

const KINDS: { id: MaintenanceKind; label: string; hint: string }[] = [
  { id: "chat", label: "Messaggi delle chat", hint: "Azioni, OFF, dadi e avvisi delle chat di gioco (anche quelli che si rileggono nel Log)." },
  { id: "messaggi", label: "Messaggi privati e dei gruppi", hint: "Messaggi ON e OFF, a due e nei gruppi." },
  { id: "account", label: "Account inattivi", hint: "Utenti senza accessi né gioco nel periodo, con tutto quello che hanno scritto. Mai l'Amministratore né chi ha un livello uguale o superiore al tuo." },
];
const PERIODS = [
  { days: 7, label: "7 giorni" },
  { days: 30, label: "1 mese" },
  { days: 90, label: "3 mesi" },
  { days: 180, label: "6 mesi" },
  { days: 365, label: "1 anno" },
];

/** Gestione → Manutenzione: pulizia con anteprima (dal Westeros: Maintenance.tsx) */
export function MaintenancePanel() {
  const [kind, setKind] = useState<MaintenanceKind>("chat");
  const [days, setDays] = useState(180);
  const [preview, setPreview] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const k = KINDS.find((x) => x.id === kind)!;
  const period = PERIODS.find((p) => p.days === days)!;

  async function doPreview() {
    setPending(true);
    setError(null);
    setDone(null);
    const r = await previewMaintenance(kind, days);
    setPending(false);
    if (!r.ok) return setError(r.error ?? "Anteprima non riuscita.");
    setPreview(r.count ?? 0);
  }
  async function doRun() {
    if (!window.confirm(`Eliminare definitivamente ${preview} elementi (${k.label.toLowerCase()} più vecchi di ${period.label})? Non si può annullare.`)) return;
    setPending(true);
    setError(null);
    const r = await runMaintenance(kind, days);
    setPending(false);
    if (!r.ok) return setError(r.error ?? "Pulizia non riuscita.");
    setDone(`Eliminati ${r.count} elementi.`);
    setPreview(null);
  }

  return (
    <div className="glass flex max-w-2xl flex-col gap-4 rounded-2xl p-5">
      <FieldLabel label="Cosa pulire" hint={k.hint}>
        <select className={inputClass} value={kind} onChange={(e) => (setKind(e.target.value as MaintenanceKind), setPreview(null))}>
          {KINDS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </FieldLabel>
      <FieldLabel label={kind === "account" ? "Inattivi da più di" : "Più vecchi di"}>
        <select className={inputClass} value={days} onChange={(e) => (setDays(Number(e.target.value)), setPreview(null))}>
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </select>
      </FieldLabel>
      <ErrorText error={error} />
      {done && <p className="text-sm text-mint">{done}</p>}
      {preview !== null && (
        <p className="rounded-xl bg-peach/10 px-4 py-3 text-sm">
          {preview === 0 ? "Nessun elemento da eliminare." : `Verranno eliminati ${preview} elementi: ${k.label.toLowerCase()} più vecchi di ${period.label}.`}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={doPreview} className="rounded-full">
          <Eye /> Anteprima
        </Button>
        <Button type="button" variant="destructive" disabled={pending || !preview} onClick={doRun} className="rounded-full">
          <Trash2 /> Elimina
        </Button>
      </div>
    </div>
  );
}
