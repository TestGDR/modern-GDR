"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, NotebookPen, Search, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { firstName, formatDateTime, initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Utility → Archivio giocate (play_archives): le giocate salvate uscendo con «Sì, salva ed esci».
// Le vede solo chi le ha salvate; ogni 6 mesi l'archivio si svuota (avviso al quinto mese).

type ArchiveSummary = {
  id: number;
  room_name: string;
  place_name: string;
  character_name: string;
  started_at: string;
  ended_at: string;
  message_count: number;
  note: string;
  characters: { id: string; name: string; avatar: string | null }[];
};
type ArchiveMessage = { kind: string; name: string; content: string; recipient: string | null; at: string };
type ArchiveFull = ArchiveSummary & { messages: ArchiveMessage[] };
type ArchiveInfo = { purge_at: string; warning: boolean };

const SUMMARY = "id, room_name, place_name, character_name, started_at, ended_at, message_count, note, characters";

/** File di testo della giocata */
function asText(a: ArchiveFull) {
  const head = [
    `${a.room_name}${a.place_name ? ` · ${a.place_name}` : ""}`,
    `${formatDateTime(a.started_at)} – ${formatDateTime(a.ended_at)}`,
    `Personaggi: ${a.characters.map((c) => c.name).join(", ")}`,
    a.note ? `Nota: ${a.note}` : "",
    "",
  ].filter((l, i) => l !== "" || i === 4);
  const lines = a.messages.map((m) => {
    const time = new Date(m.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    if (m.kind === "sistema") return `[${time}] ${m.name} ${m.content}`;
    const to = m.recipient ? ` → ${m.recipient}` : "";
    return `[${time}] ${m.name}${to}: ${m.content}`;
  });
  return [...head, ...lines].join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const fileName = (a: ArchiveSummary) =>
  `${(a.room_name || "giocata").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}-${a.started_at.slice(0, 10)}.txt`;

export function PlayArchive() {
  const supabase = useMemo(() => createClient(), []);
  const [list, setList] = useState<ArchiveSummary[] | null>(null);
  const [info, setInfo] = useState<ArchiveInfo | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ArchiveFull | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      let req = supabase.from("play_archives").select(SUMMARY).order("ended_at", { ascending: false }).limit(200);
      const s = q.trim();
      // cerca nel testo, nel nome della chat e nelle note
      if (s.length >= 2) {
        const like = `%${s.replace(/[%_,()]/g, " ")}%`;
        req = req.or(`search_text.ilike.${like},room_name.ilike.${like},note.ilike.${like}`);
      }
      const [{ data, error: e }, { data: i }] = await Promise.all([req.overrideTypes<ArchiveSummary[], { merge: false }>(), supabase.rpc("play_archive_info")]);
      if (e) setError("Non riesco a leggere l'archivio.");
      setList(data ?? []);
      setInfo((i as ArchiveInfo | null) ?? null);
    },
    [supabase],
  );

  useEffect(() => {
    const t = setTimeout(() => load(query), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  async function openOne(id: number) {
    const { data } = await supabase.from("play_archives").select(`${SUMMARY}, messages`).eq("id", id).maybeSingle<ArchiveFull>();
    if (data) setOpen(data);
  }

  async function downloadOne(a: ArchiveSummary) {
    const full = open?.id === a.id ? open : (await supabase.from("play_archives").select(`${SUMMARY}, messages`).eq("id", a.id).maybeSingle<ArchiveFull>()).data;
    if (full) download(fileName(full), asText(full));
  }

  async function remove(a: ArchiveSummary) {
    if (!window.confirm(`Eliminare la giocata in «${a.room_name}» del ${formatDateTime(a.started_at)}? Non si può recuperare.`)) return;
    const { error: e } = await supabase.from("play_archives").delete().eq("id", a.id);
    if (e) return setError("Non sono riuscito a eliminarla.");
    if (open?.id === a.id) setOpen(null);
    load(query);
  }

  async function saveNote(a: ArchiveSummary, note: string) {
    const { error: e } = await supabase.from("play_archives").update({ note: note.slice(0, 1000) }).eq("id", a.id);
    if (e) return setError("Nota non salvata.");
    setList((prev) => prev?.map((x) => (x.id === a.id ? { ...x, note } : x)) ?? null);
    if (open?.id === a.id) setOpen({ ...open, note });
  }

  const purge = info ? new Date(info.purge_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

  if (open) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setOpen(null)} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Tutte le giocate
        </button>
        <ArchiveHeader a={open} onDownload={() => downloadOne(open)} onRemove={() => remove(open)} onNote={(n) => saveNote(open, n)} />
        <ol className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-night/40 p-3 sm:p-5">
          {open.messages.map((m, i) => (
            <li key={i} className={cn("text-sm leading-relaxed", m.kind === "sistema" && "text-center text-xs text-muted-foreground")}>
              <span className="mr-2 text-xs text-muted-foreground">{new Date(m.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
              {m.kind === "sistema" ? (
                <>
                  <strong className="text-lavender">{firstName(m.name)}</strong> {m.content}
                </>
              ) : (
                <>
                  <strong className={cn("font-heading tracking-wide", m.kind === "master" ? "text-orchid" : m.kind === "dado" ? "text-peach" : "text-sand")}>
                    {m.kind === "master" ? "Master" : firstName(m.name)}
                  </strong>
                  {m.recipient && <span className="text-lavender"> → {m.recipient}</span>}{" "}
                  <span className="whitespace-pre-line">{m.content}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {info?.warning ? (
        <p className="flex items-start gap-2 rounded-xl border border-peach/50 bg-peach/15 px-4 py-3 text-sm text-peach">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Il <strong>{purge}</strong> tutte le giocate salvate verranno cancellate. Scarica (.txt) quelle che vuoi tenere.
          </span>
        </p>
      ) : (
        purge && <p className="text-xs text-muted-foreground">Le giocate restano qui fino al {purge}: ogni sei mesi l&apos;archivio si svuota, con un avviso un mese prima.</p>
      )}
      <label className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca una parola, il nome della chat o una nota…"
          className="h-10 w-full rounded-xl border border-white/15 bg-night/40 pr-3 pl-9 text-sm"
          aria-label="Cerca nelle giocate"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {list === null ? (
        <p className="text-sm text-muted-foreground">Carico…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query ? "Nessuna giocata trovata." : "Nessuna giocata salvata. Per salvarne una, in chat premi «Esci dalla chat» e poi «Sì, salva ed esci»."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((a) => (
            <li key={a.id}>
              <ArchiveHeader a={a} onOpen={() => openOne(a.id)} onDownload={() => downloadOne(a)} onRemove={() => remove(a)} onNote={(n) => saveNote(a, n)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ArchiveHeader({
  a,
  onOpen,
  onDownload,
  onRemove,
  onNote,
}: {
  a: ArchiveSummary;
  onOpen?: () => void;
  onDownload: () => void;
  onRemove: () => void;
  onNote: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(a.note);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex -space-x-2">
          {a.characters.slice(0, 5).map((c) =>
            c.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={c.id} src={c.avatar} alt={c.name} title={c.name} className="size-9 rounded-full object-cover ring-2 ring-night" />
            ) : (
              <CharacterAvatar key={c.id} initials={initials(c.name)} className="size-9 text-xs ring-2 ring-night" />
            ),
          )}
        </div>
        <div className="min-w-0 flex-1">
          {onOpen ? (
            <button type="button" onClick={onOpen} className="text-left font-heading text-xl tracking-wide text-sand hover:text-peach">
              {a.room_name || "Chat"}
            </button>
          ) : (
            <p className="font-heading text-2xl tracking-wide text-sand">{a.room_name || "Chat"}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {a.place_name && `${a.place_name} · `}
            {formatDateTime(a.started_at)} – {formatDateTime(a.ended_at)} · {a.message_count} messaggi
          </p>
          <p className="text-xs text-muted-foreground">{a.characters.map((c) => firstName(c.name)).join(", ")}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => setEditing((v) => !v)} aria-label="Nota" title="Nota personale">
            <NotebookPen />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onDownload} aria-label="Scarica" title="Scarica (.txt)">
            <Download />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={onRemove} aria-label="Elimina" title="Elimina" className="text-destructive">
            <Trash2 />
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Una nota per te (es. «primo incontro con Aria»)"
            className="rounded-xl border border-white/15 bg-night/40 px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="xs" variant="ghost" onClick={() => (setNote(a.note), setEditing(false))}>
              Annulla
            </Button>
            <Button type="button" size="xs" className="rounded-full" onClick={() => (onNote(note), setEditing(false))}>
              Salva nota
            </Button>
          </div>
        </div>
      ) : (
        a.note && <p className="rounded-lg bg-night/40 px-3 py-1.5 text-sm text-foreground/90 italic">{a.note}</p>
      )}
    </div>
  );
}
