"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { ErrorText, FieldLabel, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { SettingRow } from "@/components/admin/settings-manager";
import { Button, buttonVariants } from "@/components/ui/button";
import { deleteLevel, duplicateLevel, saveLevel } from "@/lib/actions/admin";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import type { GameSetting, UserLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  levels: UserLevel[];
  userCounts: Record<string, number>;
  myRank: number;
  isAdmin: boolean;
  defaultLevelSetting: GameSetting | null;
};

export function LevelsManager({ levels, userCounts, myRank, isAdmin, defaultLevelSetting }: Props) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { pending, error, execute } = useAdminAction();
  const router = useRouter();
  const editable = (l: UserLevel) => !l.is_admin && (isAdmin || l.rank < myRank);

  function duplicate(id: string) {
    execute(async () => {
      const result = await duplicateLevel(id);
      if (result.ok && result.id) router.push(`/gestione/livelli/${result.id}`);
      return result;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {defaultLevelSetting && (
        <ul>
          <SettingRow setting={defaultLevelSetting} levels={levels} />
        </ul>
      )}
      <p className="text-sm text-muted-foreground">
        Ogni livello ha un rango: puoi gestire solo i livelli (e gli utenti) di rango inferiore al tuo{isAdmin ? "" : ` (${myRank})`}.
        L&apos;Amministratore ha sempre tutti i permessi e non si elimina.
      </p>
      <ErrorText error={error} />

      {creating ? (
        <NewLevelForm myRank={myRank} isAdmin={isAdmin} onCancel={() => setCreating(false)} />
      ) : (
        <Button type="button" onClick={() => setCreating(true)} className="w-fit rounded-full">
          <Plus /> Nuovo livello
        </Button>
      )}

      <ul className="flex flex-col gap-2">
        {levels.map((l) => (
          <li key={l.id} className="glass flex flex-col gap-2 rounded-2xl p-3">
            <div className="flex items-center gap-3">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: l.color ?? "rgb(255 255 255 / 0.25)" }} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-xs text-muted-foreground">rango {l.rank}</span>
                  {l.is_admin && <Lock className="size-3.5 text-muted-foreground" aria-label="Protetto" />}
                </p>
                <p className="text-xs text-muted-foreground">
                  {userCounts[l.id] ?? 0} utenti ·{" "}
                  {l.is_admin ? "tutti i permessi" : `${l.permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p)).length} permessi`} · max{" "}
                  {l.max_characters} personaggi
                </p>
              </div>
              {editable(l) && (
                <Link href={`/gestione/livelli/${l.id}`} className={cn(buttonVariants({ variant: "ghost", size: "icon" }))} aria-label={`Modifica ${l.name}`}>
                  <Pencil />
                </Link>
              )}
              <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={() => duplicate(l.id)} aria-label={`Duplica ${l.name}`} title="Duplica">
                <Copy />
              </Button>
              {editable(l) && (
                <Button type="button" variant="ghost" size="icon" onClick={() => setDeleting(deleting === l.id ? null : l.id)} aria-label={`Elimina ${l.name}`}>
                  <Trash2 />
                </Button>
              )}
            </div>
            {deleting === l.id && (
              <DeletePanel
                level={l}
                users={userCounts[l.id] ?? 0}
                targets={levels.filter((x) => x.id !== l.id && !x.is_admin && (isAdmin || x.rank < myRank))}
                onCancel={() => setDeleting(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Eliminazione: si sceglie dove spostare gli utenti del livello */
function DeletePanel({ level, users, targets, onCancel }: { level: UserLevel; users: number; targets: UserLevel[]; onCancel: () => void }) {
  const [moveTo, setMoveTo] = useState(targets[0]?.id ?? "");
  const { pending, error, execute } = useAdminAction();
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <p>
        Eliminare <strong>{level.name}</strong>? I suoi {users} utenti passeranno al livello:
      </p>
      <select className={inputClass} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <ErrorText error={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="button" variant="destructive" disabled={pending || !moveTo} onClick={() => execute(() => deleteLevel(level.id, moveTo), onCancel)}>
          Elimina e sposta gli utenti
        </Button>
      </div>
    </div>
  );
}

/** Nuovo livello da zero: tutti i permessi spenti, poi si spuntano nella pagina del livello */
function NewLevelForm({ myRank, isAdmin, onCancel }: { myRank: number; isAdmin: boolean; onCancel: () => void }) {
  const maxRank = isAdmin ? 999 : myRank - 1;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [rank, setRank] = useState(Math.min(30, maxRank));
  const { pending, error, execute } = useAdminAction();
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        execute(async () => {
          const result = await saveLevel({ name, description, color, rank, permissions: [], maxCharacters: 1 });
          if (result.ok && result.id) router.push(`/gestione/livelli/${result.id}`);
          return result;
        });
      }}
      className="glass flex flex-col gap-3 rounded-2xl border-flamingo/40 p-4"
    >
      <p className="font-heading text-xl tracking-wide text-peach">Nuovo livello</p>
      <p className="text-xs text-muted-foreground">Nasce con tutti i permessi spenti: li spunti nella pagina successiva.</p>
      <ErrorText error={error} />
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
        <FieldLabel label="Nome">
          <input className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
        </FieldLabel>
        <FieldLabel label="Rango" hint={`Massimo ${maxRank}`}>
          <input className={inputClass} type="number" min={0} max={maxRank} value={rank} onChange={(e) => setRank(Number(e.target.value))} />
        </FieldLabel>
        <FieldLabel label="Colore badge">
          <input className={cn(inputClass, "p-1")} type="color" value={color ?? "#a99be6"} onChange={(e) => setColor(e.target.value)} />
        </FieldLabel>
      </div>
      <FieldLabel label="Descrizione">
        <input className={inputClass} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
      </FieldLabel>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annulla
        </Button>
        <Button type="submit" disabled={pending} className="rounded-full px-6">
          Crea e scegli i permessi
        </Button>
      </div>
    </form>
  );
}
