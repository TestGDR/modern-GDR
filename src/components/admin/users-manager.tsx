"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { ErrorText, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { assignLevel } from "@/lib/actions/admin";
import type { UserLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AdminUser = { id: string; username: string; level_id: string; created_at: string };

type Props = { users: AdminUser[]; levels: UserLevel[]; myId: string; myRank: number; isAdmin: boolean; canAssign: boolean };

/** Elenco utenti con ricerca e cambio di livello */
export function UsersManager({ users, levels, myId, myRank, isAdmin, canAssign }: Props) {
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const q = query.trim().toLowerCase();
  const visible = users.filter((u) => (!q || u.username.toLowerCase().includes(q)) && (!levelFilter || u.level_id === levelFilter));
  const levelOf = (id: string) => levels.find((l) => l.id === id);
  // Livelli che chi gestisce può assegnare: sotto il proprio rango (l'Amministratore tutti)
  const assignable = levels.filter((l) => isAdmin || (l.rank < myRank && !l.is_admin));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
        <label className="relative">
          <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
          <input className={`${inputClass} pl-9`} placeholder="Cerca per nome…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select className={inputClass} value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} aria-label="Filtra per livello">
          <option value="">Tutti i livelli</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        {visible.length} utenti su {users.length}. Non puoi cambiare il tuo livello né quello di utenti di rango uguale o superiore al tuo.
      </p>
      <ul className="flex flex-col gap-2">
        {visible.map((u) => {
          const level = levelOf(u.level_id);
          const locked = !canAssign || u.id === myId || (!isAdmin && (level?.rank ?? 0) >= myRank);
          return <UserRow key={u.id} user={u} level={level} levels={assignable} locked={locked} />;
        })}
      </ul>
    </div>
  );
}

function UserRow({ user, level, levels, locked }: { user: AdminUser; level?: UserLevel; levels: UserLevel[]; locked: boolean }) {
  const { pending, error, execute } = useAdminAction();
  return (
    <li className="glass flex flex-col gap-2 rounded-2xl p-3">
      <div className="flex items-center gap-3">
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: level?.color ?? "rgb(255 255 255 / 0.25)" }} />
        <p className="min-w-0 flex-1 truncate font-medium">{user.username}</p>
        {locked ? (
          <span className="text-sm text-muted-foreground">{level?.name ?? "—"}</span>
        ) : (
          <select
            className={cn(inputClass, "h-9 w-44")}
            value={user.level_id}
            disabled={pending}
            aria-label={`Livello di ${user.username}`}
            onChange={(e) => {
              const next = levels.find((l) => l.id === e.target.value);
              if (next && window.confirm(`Assegnare a ${user.username} il livello ${next.name}?`)) execute(() => assignLevel(user.id, next.id));
            }}
          >
            {/* il livello attuale resta visibile anche se non assegnabile */}
            {!levels.some((l) => l.id === user.level_id) && level && <option value={level.id}>{level.name}</option>}
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <ErrorText error={error} />
    </li>
  );
}
