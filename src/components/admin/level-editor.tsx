"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { ErrorText, FieldLabel, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { saveLevel } from "@/lib/actions/admin";
import { ALL_PERMISSION_KEYS, PERMISSION_AREAS } from "@/lib/permissions";
import type { UserLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  level: UserLevel;
  myRank: number;
  isAdmin: boolean;
  /** I permessi che chi modifica può concedere (tutti per l'Amministratore) */
  grantable: string[];
};

/** Modifica di un livello: dati e permessi spuntabili, raggruppati per area */
export function LevelEditor({ level, myRank, isAdmin, grantable }: Props) {
  const [name, setName] = useState(level.name);
  const [description, setDescription] = useState(level.description);
  const [color, setColor] = useState<string | null>(level.color);
  const [iconUrl, setIconUrl] = useState(level.icon_url ?? "");
  const [rank, setRank] = useState(level.rank);
  const [maxCharacters, setMaxCharacters] = useState(level.max_characters);
  const [permissions, setPermissions] = useState<string[]>(level.permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p)));
  const [saved, setSaved] = useState(false);
  const { pending, error, execute } = useAdminAction();
  const maxRank = isAdmin ? 999 : myRank - 1;
  const canGrant = (key: string) => isAdmin || grantable.includes(key);

  function toggle(key: string) {
    setSaved(false);
    setPermissions((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  }
  function setGroup(keys: string[], on: boolean) {
    setSaved(false);
    const allowed = keys.filter(canGrant);
    setPermissions((p) => (on ? [...new Set([...p, ...allowed])] : p.filter((k) => !allowed.includes(k))));
  }

  function save() {
    setSaved(false);
    execute(() => saveLevel({ id: level.id, name, description, color, iconUrl, rank, permissions, maxCharacters }), () => setSaved(true));
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      <section className="glass flex flex-col gap-3 rounded-2xl p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem]">
          <FieldLabel label="Nome">
            <input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </FieldLabel>
          <FieldLabel label="Rango" hint={`Max ${maxRank}`}>
            <input className={inputClass} type="number" min={0} max={maxRank} value={rank} onChange={(e) => setRank(Number(e.target.value))} />
          </FieldLabel>
          <FieldLabel label="Max personaggi">
            <input className={inputClass} type="number" min={0} max={20} value={maxCharacters} onChange={(e) => setMaxCharacters(Number(e.target.value))} />
          </FieldLabel>
        </div>
        <FieldLabel label="Descrizione">
          <input className={inputClass} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </FieldLabel>
        <div className="flex flex-wrap items-end gap-3">
          <FieldLabel label="Colore del badge" hint="Se c'è, il livello compare accanto al nome (es. nel forum)">
            <input className={cn(inputClass, "w-24 p-1")} type="color" value={color ?? "#a99be6"} onChange={(e) => setColor(e.target.value)} />
          </FieldLabel>
          {color && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setColor(null)}>
              Nessun badge
            </Button>
          )}
        </div>
        <FieldLabel label="Icona del livello" hint="Link https a un'immagine piccola (circa 20x20). Compare accanto al nome nei presenti online e sotto il ritratto della scheda; passandoci sopra si legge il nome del livello. Vuoto = nessuna icona.">
          <span className="flex items-center gap-2">
            <input className={inputClass} type="url" value={iconUrl} maxLength={500} placeholder="https://…" onChange={(e) => setIconUrl(e.target.value)} />
            {iconUrl.startsWith("https://") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={iconUrl} alt="Anteprima" className="size-6 shrink-0 object-contain" />
            )}
          </span>
        </FieldLabel>
      </section>

      <p className="text-sm">
        Permessi attivi: <strong className="text-mint">{permissions.length}</strong> su {ALL_PERMISSION_KEYS.length}
        {!isAdmin && <span className="text-muted-foreground"> · puoi concedere solo i permessi che hai anche tu</span>}
      </p>

      {PERMISSION_AREAS.map((area) => {
        const keys = area.items.map((i) => i.key);
        const active = keys.filter((k) => permissions.includes(k)).length;
        return (
          <section key={area.id} className="glass rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading text-xl tracking-wide text-peach">
                {area.title} <span className="font-sans text-xs tracking-normal text-muted-foreground">{active}/{keys.length}</span>
              </h3>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setGroup(keys, true)}>
                  Seleziona tutto
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setGroup(keys, false)}>
                  Deseleziona tutto
                </Button>
              </div>
            </div>
            <ul className="grid gap-1.5 @container sm:grid-cols-2">
              {area.items.map((item) => {
                const on = permissions.includes(item.key);
                const disabled = !canGrant(item.key);
                return (
                  <li key={item.key}>
                    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-white/5", disabled && "cursor-not-allowed opacity-40")}>
                      <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(item.key)} className="mt-0.5 size-4 shrink-0 accent-[var(--flamingo)]" />
                      <span className="text-sm">
                        {item.label}
                        {item.description && <span className="block text-xs text-muted-foreground">{item.description}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* Barra di salvataggio sempre visibile */}
      <div className="glass fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-2xl p-3 lg:inset-x-auto lg:right-10 lg:bottom-6 lg:w-96">
        <div className="min-w-0 flex-1 text-sm">
          {error ? <ErrorText error={error} /> : saved ? <span className="flex items-center gap-1 text-mint"><Check className="size-4" /> Salvato: l&apos;effetto è immediato</span> : <span className="text-muted-foreground">Modifiche da salvare</span>}
        </div>
        <Button type="button" disabled={pending} onClick={save} className="rounded-full px-6">
          {pending ? "Salvataggio…" : "Salva"}
        </Button>
      </div>
    </div>
  );
}
