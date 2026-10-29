"use client";

import { useState, useTransition } from "react";
import { LockOpen, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminSaveCharacter, resetCharacter, unlockCharacter, type AdminSheetInput } from "@/lib/actions/admin-sheet";
import type { CharacterBuild, RulesData } from "@/lib/data";
import type { Character, CreationOption, District } from "@/lib/types";
import { cn } from "@/lib/utils";

// Pannello dell'Amministratore sulla scheda: sblocca, resetta e modifica
// completa (anagrafica, testi, PX, caratteristiche, abilità, scelte).

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const areaCls =
  "min-h-24 w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const TEXTS: { key: keyof AdminSheetInput["texts"]; label: string; max: number }[] = [
  { key: "bio", label: "Storia", max: 5000 },
  { key: "appearance", label: "Aspetto", max: 3000 },
  { key: "traits", label: "Carattere", max: 3000 },
  { key: "known_facts", label: "Si sa che", max: 3000 },
  { key: "relationships", label: "Affetti", max: 3000 },
  { key: "equipment", label: "Equipaggiamento", max: 3000 },
];

const KIND_TITLE: Record<CreationOption["kind"], string> = { tenore: "Patrimonio", vantaggio: "Vantaggi", svantaggio: "Svantaggi", tratto: "Tratti" };

type Props = {
  character: Character;
  build: CharacterBuild;
  rules: RulesData;
  districts: District[];
  onClose: () => void;
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function AdminSheetPanel({ character, build, rules, districts, onClose }: Props) {
  const [form, setForm] = useState<AdminSheetInput>({
    sex: character.sex,
    age: character.age,
    birthDate: character.birth_date,
    nationality: character.nationality ?? "",
    studyTrackId: character.study_track_id,
    yearId: character.year_id,
    clubId: character.club_id,
    occupation: character.occupation ?? "",
    districtId: character.district_id,
    quote: character.quote ?? "",
    px: character.px,
    avatarUrl: character.avatar_url ?? "",
    coverUrl: character.cover_url ?? "",
    texts: {
      bio: character.bio ?? "",
      appearance: character.appearance ?? "",
      traits: character.traits ?? "",
      known_facts: character.known_facts ?? "",
      relationships: character.relationships ?? "",
      equipment: character.equipment ?? "",
    },
    attributes: { ...build.attributes },
    skills: { ...build.skills },
    optionIds: [...build.optionIds],
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const list = (kind: "indirizzo" | "anno" | "club") => rules.sheetOptions.filter((o) => o.kind === kind);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okText: string, after?: () => void) {
    setMessage(null);
    start(async () => {
      const r = await action();
      setMessage(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Operazione non riuscita." });
      if (r.ok) after?.();
    });
  }

  function toggleOption(o: CreationOption) {
    setForm((f) => {
      const on = f.optionIds.includes(o.id);
      if (on) return { ...f, optionIds: f.optionIds.filter((x) => x !== o.id) };
      // il patrimonio è uno solo
      const others = o.kind === "tenore" ? f.optionIds.filter((x) => rules.options.find((r) => r.id === x)?.kind !== "tenore") : f.optionIds;
      return { ...f, optionIds: [...others, o.id] };
    });
  }

  return (
    <div className="flex flex-col gap-6 p-6 pr-16 sm:p-8 sm:pr-20">
      <div>
        <h2 className="font-heading text-4xl tracking-wide text-sunset">Amministrazione</h2>
        <p className="text-sm text-muted-foreground">Solo per l&apos;Amministratore. Il giocatore riceve un messaggio di SISTEMA quando la scheda viene sbloccata o resettata.</p>
      </div>

      {message && <p className={cn("rounded-lg px-3 py-2 text-sm", message.ok ? "bg-mint/15 text-mint" : "bg-destructive/15 text-destructive")}>{message.text}</p>}

      {/* Sblocca e resetta */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4">
          <p className="font-medium">Sblocca</p>
          <p className="text-xs text-muted-foreground">
            La scheda torna in bozza con tutti i dati: il giocatore la corregge e la rimanda in approvazione. Finché non è riapprovata il personaggio non gioca.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={pending || character.status === "bozza"}
            className="mt-auto w-fit rounded-full"
            onClick={() => window.confirm(`Sbloccare la scheda di ${character.name}? Tornerà in bozza e il personaggio non potrà giocare finché non è riapprovata.`) && run(() => unlockCharacter(character.id), "Scheda sbloccata.", onClose)}
          >
            <LockOpen /> Sblocca
          </Button>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">Resetta</p>
          <p className="text-xs text-muted-foreground">
            Cancella tutto e rimanda alla creazione dal primo passaggio: caratteristiche, abilità, scelte, testi, immagini, prestavolto, PX, conto in banca, numeri di telefono, lavori e gruppi. Resta solo il nome. Non si annulla.
          </p>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            className="mt-auto w-fit rounded-full"
            onClick={() => {
              const typed = window.prompt(`Per resettare la scheda scrivi il nome del personaggio: ${character.name}`);
              if (typed === null) return;
              if (typed.trim().toLowerCase() !== character.name.toLowerCase()) return setMessage({ ok: false, text: "Il nome non corrisponde: scheda non resettata." });
              run(() => resetCharacter(character.id), "Scheda resettata.", onClose);
            }}
          >
            <RotateCcw /> Resetta
          </Button>
        </div>
      </section>

      {/* Modifica completa */}
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => adminSaveCharacter(character.id, form), "Scheda salvata.");
        }}
      >
        <section className="flex flex-col gap-3">
          <h3 className="font-heading text-2xl tracking-wide text-peach">Anagrafica</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sesso">
              <select className={inputCls} value={form.sex ?? ""} onChange={(e) => setForm({ ...form, sex: (e.target.value || null) as AdminSheetInput["sex"] })}>
                <option value="">—</option>
                <option value="M">Maschile</option>
                <option value="F">Femminile</option>
                <option value="X">Non binario</option>
              </select>
            </Field>
            <Field label="Età">
              <input className={inputCls} type="number" min={10} max={120} value={form.age ?? ""} onChange={(e) => setForm({ ...form, age: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Data di nascita">
              <input className={inputCls} type="date" value={form.birthDate ?? ""} onChange={(e) => setForm({ ...form, birthDate: e.target.value || null })} />
            </Field>
            <Field label="Nazionalità">
              <input className={inputCls} maxLength={60} value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
            </Field>
            <Field label="Lavoro (testo)">
              <input className={inputCls} maxLength={60} value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
            </Field>
            <Field label="PX non spesi">
              <input className={inputCls} type="number" min={0} max={100000} value={form.px} onChange={(e) => setForm({ ...form, px: Number(e.target.value) })} />
            </Field>
            {(
              [
                ["studyTrackId", "Indirizzo di studio", "indirizzo"],
                ["yearId", "Anno di corso", "anno"],
                ["clubId", "Squadra o club", "club"],
              ] as const
            ).map(([key, label, kind]) => (
              <Field key={key} label={label}>
                <select className={inputCls} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value || null })}>
                  <option value="">—</option>
                  {list(kind).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <Field label="Quartiere">
              <select className={inputCls} value={form.districtId ?? ""} onChange={(e) => setForm({ ...form, districtId: e.target.value || null })}>
                <option value="">—</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Citazione">
            <input className={inputCls} maxLength={140} value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ritratto (link https)">
              <input className={inputCls} value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} />
            </Field>
            <Field label="Immagine grande (link https)">
              <input className={inputCls} value={form.coverUrl} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })} />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-heading text-2xl tracking-wide text-peach">Caratteristiche e abilità</h3>
          <p className="text-xs text-muted-foreground">Senza i limiti dei punti della creazione. Un&apos;abilità non può superare la sua caratteristica.</p>
          <div className="flex flex-col gap-3">
            {rules.attributes.map((a) => (
              <div key={a.id} className="rounded-xl bg-white/5 p-3">
                <label className="flex items-center gap-3 text-sm font-medium">
                  <span className="flex-1">
                    {a.name} <span className="text-xs text-lavender">{a.code}</span>
                  </span>
                  <input
                    className={cn(inputCls, "w-20")}
                    type="number"
                    min={1}
                    max={10}
                    value={form.attributes[a.id] ?? ""}
                    onChange={(e) => setForm({ ...form, attributes: { ...form.attributes, [a.id]: Number(e.target.value) } })}
                  />
                </label>
                <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {rules.skills
                    .filter((s) => s.attribute_id === a.id)
                    .map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 text-muted-foreground">{s.name}</span>
                        <input
                          className={cn(inputCls, "h-8 w-16")}
                          type="number"
                          min={0}
                          max={10}
                          value={form.skills[s.id] ?? 0}
                          onChange={(e) => setForm({ ...form, skills: { ...form.skills, [s.id]: Number(e.target.value) } })}
                        />
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-heading text-2xl tracking-wide text-peach">Patrimonio, vantaggi, svantaggi e tratti</h3>
          {(["tenore", "vantaggio", "svantaggio", "tratto"] as const).map((kind) => (
            <div key={kind}>
              <p className="mb-1 text-sm font-medium">{KIND_TITLE[kind]}</p>
              <div className="flex flex-wrap gap-1.5">
                {rules.options
                  .filter((o) => o.kind === kind)
                  .map((o) => {
                    const on = form.optionIds.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleOption(o)}
                        className={cn("rounded-full px-3 py-1 text-xs", on ? "bg-flamingo text-white" : "bg-white/10 text-muted-foreground hover:bg-white/20")}
                      >
                        {o.name}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-heading text-2xl tracking-wide text-peach">Testi</h3>
          {TEXTS.map((t) => (
            <Field key={t.key} label={t.label}>
              <textarea className={areaCls} maxLength={t.max} value={form.texts[t.key]} onChange={(e) => setForm({ ...form, texts: { ...form.texts, [t.key]: e.target.value } })} />
            </Field>
          ))}
        </section>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 bg-gradient-to-t from-night via-night/90 to-transparent py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Chiudi
          </Button>
          <Button type="submit" disabled={pending} className="rounded-full px-6">
            <Save /> {pending ? "Salvataggio…" : "Salva la scheda"}
          </Button>
        </div>
      </form>
    </div>
  );
}
