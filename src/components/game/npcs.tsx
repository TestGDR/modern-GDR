"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, EyeOff, Pencil, Plus, Power, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstName, initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Npc } from "@/lib/types";
import { cn } from "@/lib/utils";

// Utility → PNG: i personaggi non giocanti della città e quelli legati ai giocatori.
// I giocatori propongono i propri (lo staff approva); lo staff crea quelli di ambientazione.
// Chi vede cosa lo decide la RLS (i segreti solo al giocatore collegato e allo staff).

type Tab = "citta" | "giocatori" | "miei" | "approvare";
type NpcRow = Npc & { owner: { name: string } | null };

const field = "w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring";

export function NpcsApp({ me, canManage }: { me: { id: string; name: string } | null; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [npcs, setNpcs] = useState<NpcRow[] | null>(null);
  const [tab, setTab] = useState<Tab>("citta");
  const [editing, setEditing] = useState<NpcRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("npcs").select("*, owner:characters(name)").order("name");
    setNpcs((data ?? []) as NpcRow[]);
  }, [supabase]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (!npcs) return <p className="text-sm text-muted-foreground">Carico…</p>;
  const approved = (n: NpcRow) => n.status === "approvato" && n.active;
  const lists: Record<Tab, NpcRow[]> = {
    citta: npcs.filter((n) => n.kind === "ambiente" && (approved(n) || canManage)),
    giocatori: npcs.filter((n) => n.kind === "giocatore" && approved(n)),
    miei: npcs.filter((n) => me && n.owner_character_id === me.id),
    approvare: npcs.filter((n) => n.status === "proposto"),
  };
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "citta", label: "Della città", show: true },
    { key: "giocatori", label: "Dei giocatori", show: true },
    { key: "miei", label: "I miei PNG", show: !!me },
    { key: "approvare", label: `Da approvare${lists.approvare.length ? ` (${lists.approvare.length})` : ""}`, show: canManage },
  ];

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error: e } = await fn();
    if (e) setError(e.message);
    await load();
  }

  const shown = lists[tab];
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-1 rounded-full bg-white/5 p-1" aria-label="Elenchi dei PNG">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setEditing(null);
              }}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn("rounded-full px-3 py-1.5 text-sm", tab === t.key ? "bg-flamingo/30 text-white" : "text-muted-foreground hover:bg-white/5")}
            >
              {t.label}
            </button>
          ))}
      </nav>

      {error && <p className="rounded-xl bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}

      {editing ? (
        <NpcForm
          npc={editing === "new" ? null : editing}
          ownerId={editing === "new" ? (tab === "miei" ? (me?.id ?? null) : null) : editing.owner_character_id}
          canManage={canManage}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : (
        ((tab === "citta" && canManage) || (tab === "miei" && me)) && (
          <Button type="button" onClick={() => setEditing("new")} className="w-fit rounded-full">
            <Plus /> {tab === "citta" ? "Nuovo PNG della città" : "Proponi un PNG"}
          </Button>
        )
      )}

      {tab === "miei" && (
        <p className="text-xs text-muted-foreground">
          I PNG legati al tuo personaggio (un mentore, un coinquilino, un ex, un nemico…). Proponi nome e carattere: lo staff li approva e da lì li interpreta il Master. Ogni modifica torna in approvazione. Quelli segreti li vedete solo tu e lo staff.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tab === "approvare" ? "Nessun PNG da approvare." : tab === "miei" ? "Non hai ancora PNG." : "Nessun PNG, per ora."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((n) => (
            <NpcCard
              key={n.id}
              n={n}
              canManage={canManage}
              mine={!!me && n.owner_character_id === me.id}
              onEdit={() => setEditing(n)}
              onReview={(ok) => {
                const note = ok ? "" : (window.prompt(`Perché non approvi ${n.name}? (lo legge il giocatore)`) ?? null);
                if (note === null) return;
                act(() => supabase.from("npcs").update({ status: ok ? "approvato" : "rifiutato", review_note: note }).eq("id", n.id));
              }}
              onToggle={() => act(() => supabase.from("npcs").update({ active: !n.active }).eq("id", n.id))}
              onDelete={() => window.confirm(`Eliminare ${n.name}?`) && act(() => supabase.from("npcs").delete().eq("id", n.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NpcCard({
  n,
  canManage,
  mine,
  onEdit,
  onReview,
  onToggle,
  onDelete,
}: {
  n: NpcRow;
  canManage: boolean;
  mine: boolean;
  onEdit: () => void;
  onReview: (ok: boolean) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const status =
    n.status === "proposto" ? { label: "Da approvare", cls: "bg-peach/20 text-peach" } : n.status === "rifiutato" ? { label: "Non approvato", cls: "bg-destructive/20 text-destructive" } : null;
  return (
    <li className={cn("glass flex flex-col gap-2 rounded-2xl p-3", !n.active && "opacity-60")}>
      <div className="flex items-start gap-3">
        {n.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={n.avatar_url} alt="" className="size-14 shrink-0 rounded-full object-cover ring-2 ring-white/15" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet via-orchid to-peach font-heading text-xl text-white">{initials(n.name)}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-heading text-xl leading-tight tracking-wide">{n.name}</p>
          {n.role && <p className="text-xs text-peach">{n.role}</p>}
          <p className="flex flex-wrap gap-1 pt-1 text-[0.7rem]">
            {n.kind === "giocatore" && n.owner && <span className="rounded-full bg-white/10 px-2 py-0.5">di {firstName(n.owner.name)}</span>}
            {n.secret && (
              <span className="flex items-center gap-1 rounded-full bg-orchid/25 px-2 py-0.5 text-orchid">
                <EyeOff className="size-3" /> segreto
              </span>
            )}
            {status && <span className={cn("rounded-full px-2 py-0.5", status.cls)}>{status.label}</span>}
            {!n.active && <span className="rounded-full bg-white/10 px-2 py-0.5">disattivato</span>}
          </p>
        </div>
      </div>
      {n.description && <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/85">{n.description}</p>}
      {n.status === "rifiutato" && n.review_note && <p className="text-xs text-destructive">Staff: {n.review_note}</p>}
      {(canManage || mine) && (
        <div className="flex flex-wrap gap-1 border-t border-white/10 pt-2">
          {canManage && n.status === "proposto" && (
            <>
              <Button type="button" size="xs" onClick={() => onReview(true)} className="rounded-full">
                <Check /> Approva
              </Button>
              <Button type="button" size="xs" variant="ghost" onClick={() => onReview(false)} className="rounded-full">
                <X /> Non approvare
              </Button>
            </>
          )}
          <Button type="button" size="xs" variant="ghost" onClick={onEdit} className="rounded-full">
            <Pencil /> Modifica
          </Button>
          {canManage && (
            <Button type="button" size="xs" variant="ghost" onClick={onToggle} className="rounded-full">
              <Power /> {n.active ? "Disattiva" : "Riattiva"}
            </Button>
          )}
          {(canManage || n.status !== "approvato") && (
            <Button type="button" size="xs" variant="ghost" onClick={onDelete} className="ml-auto rounded-full hover:text-destructive">
              <Trash2 /> Elimina
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function NpcForm({ npc, ownerId, canManage, onDone }: { npc: NpcRow | null; ownerId: string | null; canManage: boolean; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({
    name: npc?.name ?? "",
    role: npc?.role ?? "",
    description: npc?.description ?? "",
    avatar_url: npc?.avatar_url ?? "",
    secret: npc?.secret ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setError(null);
    const avatar = f.avatar_url.trim();
    if (avatar && !avatar.startsWith("https://")) return setError("Il ritratto deve essere un link che inizia con https://");
    setBusy(true);
    const row = { name: f.name.trim(), role: f.role.trim(), description: f.description.trim(), avatar_url: avatar || null, secret: f.secret };
    const res = npc
      ? await supabase.from("npcs").update(row).eq("id", npc.id)
      : await supabase.from("npcs").insert(ownerId ? { ...row, kind: "giocatore", owner_character_id: ownerId } : { ...row, kind: "ambiente", status: "approvato" });
    setBusy(false);
    if (res.error) return setError(res.error.code === "42501" ? "Non hai il permesso di salvare questo PNG." : res.error.message);
    onDone();
  }

  const label = "flex flex-col gap-1 text-xs";
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4">
      <p className="font-heading text-xl tracking-wide text-peach">{npc ? `Modifica ${npc.name}` : ownerId ? "Proponi un PNG" : "Nuovo PNG della città"}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}>
          Nome
          <input value={f.name} maxLength={60} onChange={(e) => set("name", e.target.value)} className={field} />
        </label>
        <label className={label}>
          Ruolo
          <input value={f.role} maxLength={60} onChange={(e) => set("role", e.target.value)} placeholder="es. Mentore, Barista del Lighthouse" className={field} />
        </label>
        <label className={cn(label, "sm:col-span-2")}>
          Descrizione e carattere
          <textarea value={f.description} maxLength={2000} rows={5} onChange={(e) => set("description", e.target.value)} className={field} />
        </label>
        <label className={cn(label, "sm:col-span-2")}>
          Ritratto (link https, facoltativo)
          <input value={f.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://…" className={field} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.secret} onChange={(e) => set("secret", e.target.checked)} /> Segreto (lo vedono solo il giocatore collegato e lo staff)
      </label>
      {!canManage && <p className="text-xs text-muted-foreground">Dopo il salvataggio il PNG va in approvazione allo staff.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} className="rounded-full">
          <X /> Annulla
        </Button>
        <Button type="button" disabled={busy || f.name.trim().length < 2} onClick={save} className="rounded-full">
          <Save /> {npc || canManage ? "Salva" : "Proponi"}
        </Button>
      </div>
    </div>
  );
}
