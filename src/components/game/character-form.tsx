"use client";

import { useActionState, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { FormMessage } from "@/components/auth/auth-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCharacter, updateCharacter } from "@/lib/actions/character";
import { STAT_MAX, STAT_MIN, STATS, STATS_BUDGET, type StatKey } from "@/lib/character-stats";
import type { Character, District, FormState } from "@/lib/types";

const initial: FormState = {};
const selectClass =
  "h-10 w-full rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type DetailsProps = { districts: District[]; character?: Character };

/** Campi descrittivi, comuni a creazione e modifica */
function DetailFields({ districts, character }: DetailsProps) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="age">Età</Label>
          <Input id="age" name="age" type="number" min={16} max={99} defaultValue={character?.age ?? ""} className="h-10 bg-night/40" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="occupation">Lavoro</Label>
          <Input id="occupation" name="occupation" maxLength={60} defaultValue={character?.occupation ?? ""} placeholder="Es. barista, meccanico…" className="h-10 bg-night/40" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="district_id">Quartiere</Label>
        <select id="district_id" name="district_id" defaultValue={character?.district_id ?? ""} className={selectClass}>
          <option value="">— Nessuno —</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="quote">Frase che lo descrive</Label>
        <Input id="quote" name="quote" maxLength={140} defaultValue={character?.quote ?? ""} placeholder="Es. Il tramonto non aspetta nessuno." className="h-10 bg-night/40" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Storia</Label>
        <Textarea id="bio" name="bio" rows={6} maxLength={5000} defaultValue={character?.bio ?? ""} placeholder="Chi è, da dove viene, cosa cerca a Miami…" className="bg-night/40" />
      </div>
    </>
  );
}

export function CreateCharacterForm({ districts, name }: { districts: District[]; name: string }) {
  const [state, action, pending] = useActionState(createCharacter, initial);
  const [stats, setStats] = useState<Record<StatKey, number>>({ physique: 5, cunning: 5, charisma: 5, driving: 5 });
  const used = Object.values(stats).reduce((a, b) => a + b, 0);
  const left = STATS_BUDGET - used;

  function change(key: StatKey, delta: number) {
    setStats((s) => {
      const next = s[key] + delta;
      if (next < STAT_MIN || next > STAT_MAX || (delta > 0 && left <= 0)) return s;
      return { ...s, [key]: next };
    });
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      {/* Il nome è quello scelto in registrazione: non si cambia */}
      <div className="rounded-xl bg-white/5 px-4 py-3">
        <p className="text-xs text-muted-foreground">Nome del personaggio</p>
        <p className="font-heading text-2xl tracking-wide">{name}</p>
      </div>

      <DetailFields districts={districts} />

      <fieldset className="rounded-2xl bg-white/5 p-4">
        <legend className="px-1 font-heading text-xl tracking-wide text-peach">Caratteristiche</legend>
        <p className="mb-3 text-xs text-muted-foreground">
          Hai {STATS_BUDGET} punti da distribuire (da {STAT_MIN} a {STAT_MAX} ciascuna). Dopo la creazione le può cambiare solo lo staff.
        </p>
        <ul className="flex flex-col gap-3">
          {STATS.map(({ key, label }) => (
            <li key={key} className="flex items-center gap-3">
              <span className="w-20 text-sm">{label}</span>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => change(key, -1)} aria-label={`Diminuisci ${label}`}>
                <Minus />
              </Button>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-violet via-flamingo to-peach" style={{ width: `${stats[key] * 10}%` }} />
              </div>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => change(key, 1)} aria-label={`Aumenta ${label}`}>
                <Plus />
              </Button>
              <span className="w-6 text-right text-sm font-semibold">{stats[key]}</span>
              <input type="hidden" name={key} value={stats[key]} />
            </li>
          ))}
        </ul>
        <p className={`mt-3 text-right text-sm ${left === 0 ? "text-mint" : "text-muted-foreground"}`}>Punti rimasti: {left}</p>
      </fieldset>

      <Button type="submit" size="lg" disabled={pending} className="h-11 rounded-full text-base">
        {pending ? "Creazione in corso…" : "Entra a Miami"}
      </Button>
    </form>
  );
}

export function EditCharacterForm({ districts, character }: { districts: District[]; character: Character }) {
  const [state, action, pending] = useActionState(updateCharacter, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <DetailFields districts={districts} character={character} />
      <Button type="submit" disabled={pending} className="self-end rounded-full px-6">
        {pending ? "Salvataggio…" : "Salva"}
      </Button>
    </form>
  );
}
