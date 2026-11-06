"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, EyeOff, Link2, Pencil, Plus, Power, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstName, initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Npc, NpcLink } from "@/lib/types";
import { cn } from "@/lib/utils";

// Utility → PNG: i personaggi non giocanti della città e quelli legati ai giocatori.
// I giocatori propongono i propri e anche quelli della città (lo staff approva);
// ai PNG della città i personaggi si legano con un legame (npc_links), anch'esso approvato dallo staff.
// Chi vede cosa lo decide la RLS (i segreti solo al giocatore collegato e allo staff).

type Tab = "citta" | "giocatori" | "miei" | "approvare";
type NpcRow = Npc & { owner: { name: string } | null };
type LinkRow = NpcLink & { character: { name: string } | null };

/** Categorie suggerite per i PNG della città (si può scriverne un'altra) */
const CATEGORIES = ["Docenti", "Staff dell'università", "Personalità influenti", "Autorità", "Famiglie", "Locali e negozi", "Malavita", "Altro"];

const field = "w-full rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring";

export function NpcsApp({ me, canManage }: { me: { id: string; name: string } | null; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [npcs, setNpcs] = useState<NpcRow[] | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [myUser, setMyUser] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("citta");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<NpcRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [n, l, u] = await Promise.all([
      supabase.from("npcs").select("*, owner:characters!npcs_owner_character_id_fkey(name)").order("name"),
      supabase.from("npc_links").select("*, character:characters!npc_links_character_id_fkey(name)").order("created_at"),
      supabase.auth.getUser(),
    ]);
    setNpcs((n.data ?? []) as NpcRow[]);
    setLinks((l.data ?? []) as LinkRow[]);
    setMyUser(u.data.user?.id ?? null);
  }, [supabase]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (!npcs) return <p className="text-sm text-muted-foreground">Carico…</p>;
  const approved = (n: NpcRow) => n.status === "approvato" && n.active;
  const proposedByMe = (n: NpcRow) => n.kind === "ambiente" && !!myUser && n.created_by === myUser && n.status !== "approvato";
  const city = npcs.filter((n) => n.kind === "ambiente" && (approved(n) || canManage || proposedByMe(n)));
  const categories = [...new Set(city.map((n) => n.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
  const myLinks = links.filter((l) => me && l.character_id === me.id);
  const linkedIds = new Set(myLinks.map((l) => l.npc_id));
  const lists: Record<Tab, NpcRow[]> = {
    citta: city.filter((n) => !category || n.category === category),
    giocatori: npcs.filter((n) => n.kind === "giocatore" && approved(n)),
    miei: npcs.filter((n) => (me && n.owner_character_id === me.id) || proposedByMe(n) || (n.kind === "ambiente" && linkedIds.has(n.id))),
    approvare: npcs.filter((n) => n.status === "proposto"),
  };
  const linksToReview = canManage ? links.filter((l) => l.status === "proposto") : [];
  const toReview = lists.approvare.length + linksToReview.length;
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "citta", label: "Della città", show: true },
    { key: "giocatori", label: "Dei giocatori", show: true },
    { key: "miei", label: "I miei PNG", show: !!me },
    { key: "approvare", label: `Da approvare${toReview ? ` (${toReview})` : ""}`, show: canManage },
  ];

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error: e } = await fn();
    if (e) setError(e.message);
    await load();
  }
  const reviewLink = (l: LinkRow, ok: boolean) => {
    const note = ok ? "" : (window.prompt("Perché non approvi questo legame? (lo legge il giocatore)") ?? null);
    if (note === null) return;
    act(() => supabase.from("npc_links").update({ status: ok ? "approvato" : "rifiutato", review_note: note }).eq("id", l.id));
  };

  const shown = lists[tab];
  const card = (n: NpcRow) => (
    <NpcCard
      key={n.id}
      n={n}
      links={links.filter((l) => l.npc_id === n.id)}
      me={me}
      canManage={canManage}
      mine={(!!me && n.owner_character_id === me.id) || proposedByMe(n)}
      onEdit={() => setEditing(n)}
      onReview={(ok) => {
        const note = ok ? "" : (window.prompt(`Perché non approvi ${n.name}? (lo legge il giocatore)`) ?? null);
        if (note === null) return;
        act(() => supabase.from("npcs").update({ status: ok ? "approvato" : "rifiutato", review_note: note }).eq("id", n.id));
      }}
      onReviewLink={reviewLink}
      onToggle={() => act(() => supabase.from("npcs").update({ active: !n.active }).eq("id", n.id))}
      onDelete={() => window.confirm(`Eliminare ${n.name}?`) && act(() => supabase.from("npcs").delete().eq("id", n.id))}
      onChanged={load}
    />
  );

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
          categories={categories}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : (
        ((tab === "citta" && (canManage || me)) || (tab === "miei" && me)) && (
          <Button type="button" onClick={() => setEditing("new")} className="w-fit rounded-full">
            <Plus /> {tab === "citta" ? (canManage ? "Nuovo PNG della città" : "Proponi un PNG della città") : "Proponi un PNG"}
          </Button>
        )
      )}

      {tab === "citta" && (
        <>
          <p className="text-xs text-muted-foreground">
            Le persone di San Diego: docenti, personalità influenti, autorità, familiari… Se il tuo personaggio è legato a uno di loro premi «Sono legato» e spiega il legame: lo staff lo
            approva. Puoi anche proporre un PNG della città che non c&apos;è ancora.
          </p>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Categorie">
              {["", ...categories].map((c) => (
                <button
                  key={c || "tutte"}
                  type="button"
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  className={cn("rounded-full px-2.5 py-1 text-xs", category === c ? "bg-lavender/30 text-white" : "bg-white/5 text-muted-foreground hover:bg-white/10")}
                >
                  {c || "Tutte"}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {tab === "miei" && (
        <p className="text-xs text-muted-foreground">
          I PNG legati al tuo personaggio (un mentore, un coinquilino, un ex, un nemico…) e quelli della città a cui sei legato. Proponi nome e carattere: lo staff li approva e da lì li
          interpreta il Master. Ogni modifica torna in approvazione. Quelli segreti li vedete solo tu e lo staff.
        </p>
      )}

      {tab === "approvare" && linksToReview.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-heading text-lg tracking-wide text-peach">Legami da approvare</h3>
          <ul className="flex flex-col gap-2">
            {linksToReview.map((l) => (
              <li key={l.id} className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <strong>{l.character ? firstName(l.character.name) : "Personaggio"}</strong> con <strong>{npcs.find((n) => n.id === l.npc_id)?.name ?? "PNG"}</strong>: «{l.relation}»
                  {l.secret && <span className="ml-1 text-xs text-orchid">(segreto)</span>}
                  {l.note && <span className="block text-xs whitespace-pre-line text-muted-foreground">{l.note}</span>}
                </span>
                <Button type="button" size="xs" onClick={() => reviewLink(l, true)} className="rounded-full">
                  <Check /> Approva
                </Button>
                <Button type="button" size="xs" variant="ghost" onClick={() => reviewLink(l, false)} className="rounded-full">
                  <X /> Non approvare
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.length === 0 ? (
        tab === "approvare" && linksToReview.length > 0 ? null : (
          <p className="text-sm text-muted-foreground">{tab === "approvare" ? "Nessun PNG da approvare." : tab === "miei" ? "Non hai ancora PNG." : "Nessun PNG, per ora."}</p>
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">{shown.map(card)}</ul>
      )}
    </div>
  );
}

function NpcCard({
  n,
  links,
  me,
  canManage,
  mine,
  onEdit,
  onReview,
  onReviewLink,
  onToggle,
  onDelete,
  onChanged,
}: {
  n: NpcRow;
  links: LinkRow[];
  me: { id: string; name: string } | null;
  canManage: boolean;
  mine: boolean;
  onEdit: () => void;
  onReview: (ok: boolean) => void;
  onReviewLink: (l: LinkRow, ok: boolean) => void;
  onToggle: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [linking, setLinking] = useState(false);
  const status =
    n.status === "proposto" ? { label: "Da approvare", cls: "bg-peach/20 text-peach" } : n.status === "rifiutato" ? { label: "Non approvato", cls: "bg-destructive/20 text-destructive" } : null;
  const myLink = me ? links.find((l) => l.character_id === me.id) : undefined;
  const city = n.kind === "ambiente";
  // il proprietario modifica i suoi; i PNG della città proposti dal giocatore solo finché non sono approvati
  const canEdit = canManage || (mine && (!city || n.status !== "approvato"));
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
            {city && n.category && <span className="rounded-full bg-lavender/20 px-2 py-0.5 text-lavender">{n.category}</span>}
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

      {city && links.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-white/10 pt-2 text-xs">
          <p className="text-[0.65rem] tracking-widest text-muted-foreground uppercase">Legati</p>
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-1.5">
                <Link2 className="size-3 text-lavender" />
                <strong>{l.character ? firstName(l.character.name) : "Personaggio"}</strong>
                <span className="text-muted-foreground">«{l.relation}»</span>
                {l.secret && <EyeOff className="size-3 text-orchid" aria-label="segreto" />}
                {l.status === "proposto" && <span className="rounded-full bg-peach/20 px-1.5 text-peach">da approvare</span>}
                {l.status === "rifiutato" && <span className="rounded-full bg-destructive/20 px-1.5 text-destructive">non approvato{l.review_note ? `: ${l.review_note}` : ""}</span>}
                {canManage && l.status === "proposto" && (
                  <>
                    <button type="button" onClick={() => onReviewLink(l, true)} className="rounded-full p-0.5 hover:bg-white/10" aria-label="Approva il legame" title="Approva">
                      <Check className="size-3.5 text-mint" />
                    </button>
                    <button type="button" onClick={() => onReviewLink(l, false)} className="rounded-full p-0.5 hover:bg-white/10" aria-label="Non approvare il legame" title="Non approvare">
                      <X className="size-3.5" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {city && me && n.status === "approvato" && n.active && (
        <div className="border-t border-white/10 pt-2">
          {linking ? (
            <LinkForm
              npc={n}
              characterId={me.id}
              link={myLink ?? null}
              onDone={() => {
                setLinking(false);
                onChanged();
              }}
            />
          ) : (
            <Button type="button" size="xs" variant="ghost" onClick={() => setLinking(true)} className="rounded-full">
              <Link2 /> {myLink ? "Il mio legame" : "Sono legato"}
            </Button>
          )}
        </div>
      )}

      {(canManage || canEdit) && (
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
          {canEdit && (
            <Button type="button" size="xs" variant="ghost" onClick={onEdit} className="rounded-full">
              <Pencil /> Modifica
            </Button>
          )}
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

/** Legame del proprio personaggio con un PNG della città: si propone, lo staff approva */
function LinkForm({ npc, characterId, link, onDone }: { npc: NpcRow; characterId: string; link: LinkRow | null; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({ relation: link?.relation ?? "", note: link?.note ?? "", secret: link?.secret ?? false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: e } = await p;
    setBusy(false);
    if (e) return setError(e.message);
    onDone();
  }
  const row = { relation: f.relation.trim(), note: f.note.trim(), secret: f.secret };
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-muted-foreground">Che legame ha il tuo personaggio con {npc.name}? Lo staff lo approva; ogni modifica torna in approvazione.</p>
      <input value={f.relation} maxLength={120} onChange={(e) => setF({ ...f, relation: e.target.value })} placeholder="es. Il mio relatore, Mio zio, Mi deve un favore" className={field} />
      <textarea value={f.note} maxLength={1000} rows={3} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Racconta il legame (facoltativo)" className={field} />
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={f.secret} onChange={(e) => setF({ ...f, secret: e.target.checked })} /> Segreto (lo vedete solo tu e lo staff)
      </label>
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-1">
        {link && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => window.confirm(`Togliere il legame con ${npc.name}?`) && run(supabase.from("npc_links").delete().eq("id", link.id))}
            className="mr-auto rounded-full hover:text-destructive"
          >
            <Trash2 /> Togli il legame
          </Button>
        )}
        <Button type="button" size="xs" variant="ghost" onClick={onDone} className="rounded-full">
          <X /> Annulla
        </Button>
        <Button
          type="button"
          size="xs"
          disabled={busy || row.relation.length < 2}
          onClick={() =>
            run(
              link
                ? supabase.from("npc_links").update(row).eq("id", link.id)
                : supabase.from("npc_links").insert({ ...row, npc_id: npc.id, character_id: characterId, status: "proposto" }),
            )
          }
          className="rounded-full"
        >
          <Save /> Proponi
        </Button>
      </div>
    </div>
  );
}

function NpcForm({
  npc,
  ownerId,
  canManage,
  categories,
  onDone,
}: {
  npc: NpcRow | null;
  ownerId: string | null;
  canManage: boolean;
  categories: string[];
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const city = npc ? npc.kind === "ambiente" : !ownerId;
  const [f, setF] = useState({
    name: npc?.name ?? "",
    role: npc?.role ?? "",
    category: npc?.category ?? "",
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
    const row = {
      name: f.name.trim(),
      role: f.role.trim(),
      category: city ? f.category.trim() : "",
      description: f.description.trim(),
      avatar_url: avatar || null,
      secret: f.secret,
    };
    const res = npc
      ? await supabase.from("npcs").update(row).eq("id", npc.id)
      : await supabase
          .from("npcs")
          .insert(ownerId ? { ...row, kind: "giocatore", owner_character_id: ownerId } : { ...row, kind: "ambiente", status: canManage ? "approvato" : "proposto" });
    setBusy(false);
    if (res.error) return setError(res.error.code === "42501" ? "Non hai il permesso di salvare questo PNG." : res.error.message);
    onDone();
  }

  const label = "flex flex-col gap-1 text-xs";
  const suggestions = [...new Set([...CATEGORIES, ...categories])];
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4">
      <p className="font-heading text-xl tracking-wide text-peach">
        {npc ? `Modifica ${npc.name}` : ownerId ? "Proponi un PNG" : canManage ? "Nuovo PNG della città" : "Proponi un PNG della città"}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={label}>
          Nome
          <input value={f.name} maxLength={60} onChange={(e) => set("name", e.target.value)} className={field} />
        </label>
        <label className={label}>
          Ruolo
          <input
            value={f.role}
            maxLength={60}
            onChange={(e) => set("role", e.target.value)}
            placeholder={city ? "es. Docente di Chimica organica, Sindaco" : "es. Mentore, Coinquilino"}
            className={field}
          />
        </label>
        {city && (
          <label className={cn(label, "sm:col-span-2")}>
            Categoria
            <input value={f.category} maxLength={40} list="npc-categories" onChange={(e) => set("category", e.target.value)} placeholder="es. Docenti" className={field} />
            <datalist id="npc-categories">
              {suggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        )}
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
        <input type="checkbox" checked={f.secret} onChange={(e) => set("secret", e.target.checked)} /> Segreto ({city ? "lo vede solo lo staff" : "lo vedono solo il giocatore collegato e lo staff"})
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
