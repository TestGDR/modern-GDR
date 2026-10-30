"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, ChevronRight, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { FloatingWindow } from "@/components/floating-window";
import { RichEditor } from "@/components/guide/rich-editor";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Guida del gioco: macrosezioni → sottosezioni → discussioni.
// A sinistra l'elenco, al centro la discussione aperta. Chi ha "guida.scrivere"
// passa in modifica: crea, rinomina, ordina ed elimina, e scrive i testi.

type Macro = { id: string; name: string; sort_order: number };
type Section = { id: string; macro_id: string; name: string; sort_order: number };
type Page = { id: string; section_id: string; name: string; content: string; sort_order: number; updated_at: string };
type Table = "guide_macros" | "guide_sections" | "guide_pages";

const inputCls =
  "h-9 w-full rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const byOrder = <T extends { sort_order: number; name: string }>(a: T, b: T) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "it");

/** Pulsante lungo nella barra laterale, sotto gli Annunci staff */
export function GuideButton({ canEdit, className, children }: { canEdit: boolean; className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex items-center justify-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        }
      >
        {children ?? (
          <>
            <BookOpen className="size-4" /> Guida
          </>
        )}
      </button>
      {open && (
        <FloatingWindow label="Guida" onClose={() => setOpen(false)} initialWidth={1150} initialHeight={760} chromeless>
          <GuideApp canEdit={canEdit} onClose={() => setOpen(false)} />
        </FloatingWindow>
      )}
    </>
  );
}

function GuideApp({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [macros, setMacros] = useState<Macro[] | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ name: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [m, s, p] = await Promise.all([
      supabase.from("guide_macros").select("id, name, sort_order"),
      supabase.from("guide_sections").select("id, macro_id, name, sort_order"),
      supabase.from("guide_pages").select("id, section_id, name, content, sort_order, updated_at"),
    ]);
    const ms = ((m.data ?? []) as Macro[]).sort(byOrder);
    setMacros(ms);
    setSections(((s.data ?? []) as Section[]).sort(byOrder));
    setPages(((p.data ?? []) as Page[]).sort(byOrder));
    // la prima volta si apre la prima macrosezione
    setOpenIds((prev) => (prev.size === 0 && ms[0] ? new Set([ms[0].id]) : prev));
  }, [supabase]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const page = pages.find((p) => p.id === selected) ?? null;
  const section = page ? sections.find((s) => s.id === page.section_id) : null;
  const macro = section ? macros?.find((m) => m.id === section.macro_id) : null;
  const dirty = !!page && !!draft && (draft.name !== page.name || draft.content !== page.content);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function open(p: Page) {
    if (p.id === selected) return;
    if (dirty && !window.confirm("Ci sono modifiche non salvate. Lasciarle?")) return;
    setSelected(p.id);
    setDraft({ name: p.name, content: p.content });
  }

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error: e } = await action;
    if (e) setError(e.message.includes("row-level security") ? "Non hai il permesso di modificare la guida." : "Operazione non riuscita. Riprova.");
    await load();
    return !e;
  }

  async function add(table: Table, name: string, parent?: { key: "macro_id" | "section_id"; id: string }) {
    const clean = name.trim();
    if (!clean) return;
    const siblings = table === "guide_macros" ? (macros ?? []) : table === "guide_sections" ? sections.filter((s) => s.macro_id === parent?.id) : pages.filter((p) => p.section_id === parent?.id);
    const row: Record<string, unknown> = { name: clean.slice(0, table === "guide_pages" ? 160 : 120), sort_order: siblings.length + 1 };
    if (parent) row[parent.key] = parent.id;
    const { data, error: e } = await supabase.from(table).insert(row).select("id").single<{ id: string }>();
    if (e) setError("Non salvato. Riprova.");
    await load();
    if (data && parent) setOpenIds((prev) => new Set(prev).add(parent.id));
    if (data && table === "guide_pages") {
      setSelected(data.id);
      setDraft({ name: clean, content: "" });
    }
  }

  async function rename(table: Table, id: string, current: string) {
    const name = window.prompt("Nuovo nome", current);
    if (!name || !name.trim() || name.trim() === current) return;
    await run(supabase.from(table).update({ name: name.trim().slice(0, 160) }).eq("id", id));
  }

  async function remove(table: Table, id: string, name: string, what: string) {
    if (!window.confirm(`Eliminare ${what} «${name}»${table === "guide_pages" ? "" : " con tutto quello che contiene"}? Non si annulla.`)) return;
    if (table === "guide_pages" && id === selected) setSelected(null);
    await run(supabase.from(table).delete().eq("id", id));
  }

  /** Sposta su o giù tra le voci dello stesso livello (rinumera l'ordine) */
  async function move<T extends { id: string }>(table: Table, list: T[], id: string, dir: -1 | 1) {
    const ids = list.map((x) => x.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setError(null);
    for (const [index, rowId] of ids.entries()) {
      const { error: e } = await supabase.from(table).update({ sort_order: index + 1 }).eq("id", rowId);
      if (e) {
        setError("Ordine non salvato.");
        break;
      }
    }
    await load();
  }

  async function save() {
    if (!page || !draft) return;
    if (!draft.name.trim()) return setError("Scrivi il titolo della discussione.");
    setSaving(true);
    const ok = await run(supabase.from("guide_pages").update({ name: draft.name.trim().slice(0, 160), content: draft.content }).eq("id", page.id));
    setSaving(false);
    if (ok) setError(null);
  }

  function stopEditing() {
    if (dirty && !window.confirm("Ci sono modifiche non salvate. Uscire dalla modifica senza salvarle?")) return;
    if (page) setDraft({ name: page.name, content: page.content });
    setEditing(false);
  }

  const tools = (table: Table, list: { id: string }[], id: string, name: string, what: string) =>
    editing && (
      <span className="flex shrink-0 items-center opacity-70 group-hover:opacity-100">
        <IconBtn label="Sposta su" onClick={() => move(table, list, id, -1)}>
          <ArrowUp />
        </IconBtn>
        <IconBtn label="Sposta giù" onClick={() => move(table, list, id, 1)}>
          <ArrowDown />
        </IconBtn>
        <IconBtn label={`Rinomina ${name}`} onClick={() => rename(table, id, name)}>
          <Pencil />
        </IconBtn>
        <IconBtn label={`Elimina ${name}`} danger onClick={() => remove(table, id, name, what)}>
          <Trash2 />
        </IconBtn>
      </span>
    );

  return (
    <div className="@container flex h-full flex-col">
      {/* barra del titolo: si trascina da qui */}
      <header data-window-drag="" className="flex shrink-0 cursor-grab items-center gap-3 border-b border-white/10 px-4 py-2.5 select-none active:cursor-grabbing">
        <h1 className="rounded-md bg-gradient-to-r from-flamingo/80 via-orchid/50 to-transparent px-3 py-1 font-heading text-xl tracking-[0.12em] text-white">Guida</h1>
        <span className="ml-auto flex items-center gap-2">
          {canEdit &&
            (editing ? (
              <Button type="button" size="sm" onClick={stopEditing} className="rounded-full">
                <Check /> Fine modifica
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} className="rounded-full">
                <Pencil /> Modifica
              </Button>
            ))}
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Chiudi">
            ✕
          </button>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col @3xl:flex-row">
        {/* Elenco */}
        <nav className="max-h-[40%] shrink-0 overflow-y-auto border-b border-white/10 p-3 @3xl:max-h-none @3xl:w-80 @3xl:border-r @3xl:border-b-0" aria-label="Sezioni della guida">
          {macros === null && <p className="p-2 text-sm text-muted-foreground">Caricamento…</p>}
          {macros?.length === 0 && !editing && <p className="p-2 text-sm text-muted-foreground">La guida è ancora vuota.</p>}
          <ul className="flex flex-col">
            {(macros ?? []).map((m) => {
              const mSections = sections.filter((s) => s.macro_id === m.id);
              const mOpen = openIds.has(m.id);
              return (
                <li key={m.id} className="border-b border-white/5 py-1">
                  <div className="group flex items-center gap-1">
                    <button type="button" onClick={() => toggle(m.id)} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/5">
                      {mOpen ? <ChevronDown className="size-4 shrink-0 text-flamingo" /> : <ChevronRight className="size-4 shrink-0 text-flamingo" />}
                      <span className="font-heading text-lg tracking-[0.12em] text-peach uppercase">{m.name}</span>
                    </button>
                    {tools("guide_macros", macros ?? [], m.id, m.name, "la macrosezione")}
                  </div>
                  {mOpen && (
                    <ul className="ml-3 flex flex-col border-l border-white/10 pl-2">
                      {mSections.map((s) => {
                        const sPages = pages.filter((p) => p.section_id === s.id);
                        const sOpen = openIds.has(s.id);
                        return (
                          <li key={s.id}>
                            <div className="group flex items-center gap-1">
                              <button type="button" onClick={() => toggle(s.id)} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-sm font-medium hover:bg-white/5">
                                {sOpen ? <ChevronDown className="size-3.5 shrink-0 text-lavender" /> : <ChevronRight className="size-3.5 shrink-0 text-lavender" />}
                                <span className="break-words">{s.name}</span>
                              </button>
                              {tools("guide_sections", mSections, s.id, s.name, "la sottosezione")}
                            </div>
                            {sOpen && (
                              <ul className="ml-3 flex flex-col border-l border-white/10 pl-2">
                                {sPages.map((p) => (
                                  <li key={p.id} className="group flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => open(p)}
                                      className={cn(
                                        "min-w-0 flex-1 rounded-lg px-2 py-1 text-left text-[0.8rem] break-words transition-colors",
                                        p.id === selected ? "bg-flamingo/20 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                                      )}
                                    >
                                      {p.name}
                                    </button>
                                    {tools("guide_pages", sPages, p.id, p.name, "la discussione")}
                                  </li>
                                ))}
                                {sPages.length === 0 && !editing && <li className="px-2 py-1 text-xs text-muted-foreground">Nessuna discussione.</li>}
                                {editing && <AddRow placeholder="Nuova discussione" onAdd={(n) => add("guide_pages", n, { key: "section_id", id: s.id })} />}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                      {editing && <AddRow placeholder="Nuova sottosezione" onAdd={(n) => add("guide_sections", n, { key: "macro_id", id: m.id })} />}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {editing && (
            <div className="mt-3 rounded-xl border border-dashed border-white/15 p-2">
              <AddRow placeholder="Nuova macrosezione" onAdd={(n) => add("guide_macros", n)} />
              <p className="mt-1.5 px-1 text-[0.65rem] text-muted-foreground">
                Le frecce spostano le voci; la matita rinomina; il cestino elimina (con tutto il contenuto).
              </p>
            </div>
          )}
        </nav>

        {/* Documento */}
        <section className="min-h-0 flex-1 overflow-y-auto px-5 py-4 @3xl:px-8">
          {error && <p className="mb-3 rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>}
          {!page ? (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              <p>
                <BookOpen className="mx-auto mb-2 size-8 text-lavender" />
                Scegli una discussione dall&apos;elenco.
              </p>
            </div>
          ) : (
            <article className="mx-auto flex max-w-3xl flex-col gap-3">
              <p className="text-xs tracking-[0.2em] text-lavender uppercase">
                {macro?.name} · {section?.name}
              </p>
              {editing && draft ? (
                <>
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={160} className={cn(inputCls, "h-11 font-heading text-2xl tracking-wide")} aria-label="Titolo della discussione" />
                  <RichEditor key={page.id} value={draft.content} onChange={(content) => setDraft((d) => (d ? { ...d, content } : d))} />
                  <div className="sticky bottom-0 flex items-center justify-end gap-3 bg-gradient-to-t from-dusk via-dusk/90 to-transparent py-3">
                    {dirty && <span className="text-xs text-peach">Modifiche non salvate</span>}
                    <Button type="button" onClick={save} disabled={saving || !dirty} className="rounded-full px-6">
                      <Save /> {saving ? "Salvataggio…" : "Salva"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="font-heading text-4xl tracking-wide text-sunset">{page.name}</h2>
                  <HtmlContent html={page.content} />
                </>
              )}
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

/** Testo della discussione, ripulito da script e codice pericoloso */
function HtmlContent({ html }: { html: string }) {
  const clean = useMemo(() => (typeof window === "undefined" ? "" : DOMPurify.sanitize(html)), [html]);
  if (!html.trim()) return <p className="text-sm text-muted-foreground">Ancora nessun testo.</p>;
  return <div className="guide-content" dangerouslySetInnerHTML={{ __html: clean }} />;
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="mt-1 flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value);
        setValue("");
      }}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={160} className={cn(inputCls, "h-8 text-xs")} aria-label={placeholder} />
      <button type="submit" className="grid size-8 shrink-0 place-items-center rounded-lg bg-flamingo text-night hover:bg-flamingo/90" aria-label={`Aggiungi: ${placeholder}`}>
        <Plus className="size-4" />
      </button>
    </form>
  );
}

function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn("grid size-6 place-items-center rounded-md text-muted-foreground [&_svg]:size-3.5", danger ? "hover:bg-destructive/20 hover:text-destructive" : "hover:bg-white/10 hover:text-foreground")}
    >
      {children}
    </button>
  );
}
