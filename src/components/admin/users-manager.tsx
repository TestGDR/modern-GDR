"use client";

import { useState } from "react";
import { Ban, Search, ShieldOff } from "lucide-react";
import { ErrorText, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { assignLevel } from "@/lib/actions/admin";
import { banUser } from "@/lib/actions/site";
import type { AdminUserRow } from "@/lib/admin-data";
import { formatDateTime } from "@/lib/format";
import type { UserLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  users: AdminUserRow[];
  levels: UserLevel[];
  myId: string;
  myRank: number;
  isAdmin: boolean;
  canAssign: boolean;
  canBan: boolean;
  /** Giorni senza accessi né gioco per essere "inattivo" (Gestione → Impostazioni) */
  inactiveDays: number;
  /** Ora della richiesta (ms), per calcolare gli inattivi */
  now: number;
};

const DAY = 24 * 60 * 60 * 1000;

/** Elenco utenti: livello, ultimo accesso e gioco, filtro inattivi, sospensioni */
export function UsersManager({ users, levels, myId, myRank, isAdmin, canAssign, canBan, inactiveDays, now }: Props) {
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [onlyInactive, setOnlyInactive] = useState(false);
  const q = query.trim().toLowerCase();
  const limit = now - inactiveDays * DAY;
  const isInactive = (u: AdminUserRow) =>
    Date.parse(u.created_at) < limit &&
    Date.parse(u.last_login_at ?? u.created_at) < limit &&
    (!u.last_played_at || Date.parse(u.last_played_at) < limit);
  const visible = users.filter(
    (u) =>
      (!q || u.username.toLowerCase().includes(q) || (u.character_name ?? "").toLowerCase().includes(q)) &&
      (!levelFilter || u.level_id === levelFilter) &&
      (!onlyInactive || isInactive(u)),
  );
  const levelOf = (id: string) => levels.find((l) => l.id === id);
  // Livelli che chi gestisce può assegnare: sotto il proprio rango (l'Amministratore tutti)
  const assignable = levels.filter((l) => isAdmin || (l.rank < myRank && !l.is_admin));
  const inactiveCount = users.filter(isInactive).length;

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
      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyInactive} onChange={(e) => setOnlyInactive(e.target.checked)} className="size-4 accent-flamingo" />
        Solo inattivi da oltre {inactiveDays} giorni ({inactiveCount})
      </label>
      <p className="text-xs text-muted-foreground">
        {visible.length} utenti su {users.length}. Non puoi cambiare il tuo livello né quello di utenti di rango uguale o superiore al tuo. Gli account inattivi si eliminano da Manutenzione.
      </p>
      <ul className="flex flex-col gap-2">
        {visible.map((u) => {
          const level = levelOf(u.level_id);
          const higher = !isAdmin && (level?.rank ?? 0) >= myRank;
          const locked = !canAssign || u.id === myId || higher;
          return (
            <UserRow
              key={u.id}
              user={u}
              level={level}
              levels={assignable}
              locked={locked}
              canBan={canBan && u.id !== myId && !higher && !level?.is_admin}
              inactive={isInactive(u)}
              now={now}
            />
          );
        })}
      </ul>
    </div>
  );
}

function UserRow({
  user,
  level,
  levels,
  locked,
  canBan,
  inactive,
  now,
}: {
  user: AdminUserRow;
  level?: UserLevel;
  levels: UserLevel[];
  locked: boolean;
  canBan: boolean;
  inactive: boolean;
  now: number;
}) {
  const { pending, error, execute } = useAdminAction();
  const [banning, setBanning] = useState(false);
  const banned = !!user.banned_until && (user.banned_until === "infinity" || Date.parse(user.banned_until) > now);
  return (
    <li className={cn("glass flex flex-col gap-2 rounded-2xl p-3", banned && "border-destructive/50")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: level?.color ?? "rgb(255 255 255 / 0.25)" }} />
        {/* sul telefono nome e date stanno su una riga a sé, i comandi vanno sotto */}
        <div className="min-w-0 flex-1 basis-[calc(100%-1.5rem)] sm:basis-0">
          <p className="font-medium">
            {user.username}
            {inactive && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[0.65rem] text-muted-foreground">inattivo</span>}
            {banned && <span className="ml-2 rounded-full bg-destructive/20 px-2 py-0.5 text-[0.65rem] text-destructive">sospeso</span>}
          </p>
          <p className="text-xs text-muted-foreground sm:truncate">
            Ultimo accesso: {user.last_login_at ? formatDateTime(user.last_login_at) : "mai"} · Ultimo gioco: {user.last_played_at ? formatDateTime(user.last_played_at) : "mai"}
            {user.character_status && user.character_status !== "approvata" && ` · scheda ${user.character_status.replace("_", " ")}`}
          </p>
        </div>
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
            {!levels.some((l) => l.id === user.level_id) && level && <option value={level.id}>{level.name}</option>}
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        {canBan &&
          (banned ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => window.confirm(`Togliere la sospensione a ${user.username}?`) && execute(() => banUser(user.id, null, ""))}
              className="rounded-full"
            >
              <ShieldOff /> Togli sospensione
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setBanning(!banning)} className="rounded-full text-destructive">
              <Ban /> Sospendi
            </Button>
          ))}
      </div>
      {banned && (
        <p className="text-xs text-destructive">
          Sospeso {user.banned_until === "infinity" ? "a tempo indeterminato" : `fino al ${formatDateTime(user.banned_until!)}`}
          {user.ban_reason && ` · ${user.ban_reason}`}
        </p>
      )}
      {banning && !banned && <BanForm onCancel={() => setBanning(false)} onBan={(until, reason) => execute(() => banUser(user.id, until, reason), () => setBanning(false))} pending={pending} />}
      <ErrorText error={error} />
    </li>
  );
}

const DURATIONS = [
  { value: "1", label: "1 giorno" },
  { value: "3", label: "3 giorni" },
  { value: "7", label: "1 settimana" },
  { value: "30", label: "1 mese" },
  { value: "infinity", label: "Per sempre" },
];

function BanForm({ onCancel, onBan, pending }: { onCancel: () => void; onBan: (until: string, reason: string) => void; pending: boolean }) {
  const [duration, setDuration] = useState("3");
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const until = duration === "infinity" ? "infinity" : new Date(Date.now() + Number(duration) * DAY).toISOString();
        onBan(until, reason);
      }}
      className="flex flex-col gap-2 rounded-xl bg-destructive/10 p-3 sm:flex-row"
    >
      <select className={cn(inputClass, "sm:w-40")} value={duration} onChange={(e) => setDuration(e.target.value)} aria-label="Durata">
        {DURATIONS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Motivo (lo vedrà l'utente)" />
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="h-10 rounded-full">
          Annulla
        </Button>
        <Button type="submit" variant="destructive" disabled={pending} className="h-10 rounded-full">
          Sospendi
        </Button>
      </div>
    </form>
  );
}
