"use client";

import { useState } from "react";
import { Check, Dices, Lock, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { expelFromRoom, inviteToRoom, rollDice, setMasterMode } from "@/lib/actions/chat";
import { EDIT_WINDOW_MS } from "@/lib/chat";
import { formatTime } from "@/lib/format";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

// Pezzi della chat di gioco: righe dei messaggi, dadi, modalità master, invitati.

/* ------------------------------ Testo ------------------------------ */

/** Evidenzia i nomi dei miei personaggi nei messaggi degli altri */
function Highlighted({ text, names }: { text: string; names: string[] }) {
  if (!names.length) return <>{text}</>;
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${esc.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} title="Il tuo personaggio" className="rounded-sm bg-flamingo/30 px-0.5 font-semibold text-white">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Il parlato tra < >, «caporali» o "virgolette" prende il colore scelto per il parlato */
export function FormattedText({ text, names = [] }: { text: string; names?: string[] }) {
  const parts = text.split(/(<[^<>]*>|«[^»]*»|"[^"]*"|“[^”]*”)/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-semibold" style={{ color: "var(--chat-speech, #fde68a)" }}>
            <Highlighted text={part} names={names} />
          </span>
        ) : (
          <span key={i}>
            <Highlighted text={part} names={names} />
          </span>
        ),
      )}
    </>
  );
}

/* ------------------------------ Messaggi ------------------------------ */

type RowProps = {
  message: Message;
  /** Nomi dei miei personaggi da evidenziare (non nei miei messaggi) */
  myNames: string[];
  mine: boolean;
  canModerate: boolean;
  now: number;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
};

export function MessageRow({ message: m, myNames, mine, canModerate, now, onEdit, onDelete }: RowProps) {
  const time = formatTime(m.created_at);
  const names = mine ? [] : myNames;
  const editable =
    mine && !m.edited_at && ["azione", "fuori_gioco", "master", "sussurro"].includes(m.kind) && now - Date.parse(m.created_at) < EDIT_WINDOW_MS;
  const deletable = canModerate || (mine && ["azione", "fuori_gioco", "master", "sussurro"].includes(m.kind));
  const tools =
    editable || deletable ? (
      <span className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
        {editable && (
          <button type="button" onClick={() => onEdit(m)} className="rounded p-1 hover:bg-white/10" aria-label="Correggi" title="Correggi (una volta, entro 5 minuti)">
            <Pencil className="size-3.5" />
          </button>
        )}
        {deletable && (
          <button type="button" onClick={() => onDelete(m)} className="rounded p-1 hover:bg-destructive/20 hover:text-destructive" aria-label="Elimina" title="Elimina">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </span>
    ) : null;
  const to = m.recipient && m.kind !== "sussurro" ? <span className="font-normal text-lavender"> → {m.recipient}</span> : null;
  const edited = m.edited_at ? <span className="ml-1 text-[0.7rem] text-muted-foreground">(corretto)</span> : null;

  if (m.kind === "sistema") {
    return (
      <p className="px-1 text-center text-xs text-muted-foreground">
        <span className="mr-2">{time}</span>
        <strong className="font-semibold text-lavender">{m.character_name}</strong> {m.content}
      </p>
    );
  }

  if (m.kind === "dado") {
    return (
      <div className="group flex items-start gap-2 rounded-xl border border-peach/25 bg-peach/10 px-3 py-2 text-sm">
        <Dices className="mt-0.5 size-4 shrink-0 text-peach" />
        <p className="min-w-0 flex-1">
          <span className="mr-2 text-xs text-muted-foreground">{time}</span>
          <strong className="font-heading tracking-wide text-peach">{m.character_name}</strong> {m.content}
          {m.roll_data && (m.roll_data.die === 10 || m.roll_data.die === 1) && (
            <span className={cn("ml-2 rounded-full px-2 py-0.5 text-xs", m.roll_data.die === 10 ? "bg-mint/20 text-mint" : "bg-destructive/20 text-destructive")}>
              {m.roll_data.die === 10 ? "10 naturale!" : "1 naturale"}
            </span>
          )}
        </p>
        {tools}
      </div>
    );
  }

  if (m.kind === "sussurro") {
    return (
      <div className="group flex items-start gap-2 rounded-xl border border-lavender/30 bg-violet/25 px-3 py-2 text-sm">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-lavender" />
        <p className="min-w-0 flex-1">
          <span className="mr-2 text-xs text-muted-foreground">{time}</span>
          <strong className="text-lavender">
            {m.character_name} sussurra a {m.recipient ?? "…"}:
          </strong>{" "}
          <FormattedText text={m.content} names={names} />
          {edited}
        </p>
        {tools}
      </div>
    );
  }

  if (m.kind === "fuori_gioco") {
    return (
      <div className="group flex items-start gap-2 px-1 text-sm text-muted-foreground">
        <p className="min-w-0 flex-1">
          <span className="mr-2 text-xs">{time}</span>
          <span className="mr-1 rounded bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wider uppercase">OFF</span>
          <strong className="text-foreground/80">{m.character_name}:</strong> {m.content}
          {edited}
        </p>
        {tools}
      </div>
    );
  }

  if (m.kind === "master") {
    return (
      <article className="group rounded-2xl border border-orchid/40 bg-gradient-to-br from-violet/40 via-dusk/40 to-orchid/20 px-4 py-3">
        <header className="mb-1 flex items-center gap-2">
          <span className="font-heading text-lg tracking-[0.2em] text-orchid">Master{to}</span>
          <span className="ml-auto text-xs text-muted-foreground">{time}</span>
          {tools}
        </header>
        <p className="leading-relaxed whitespace-pre-line" style={{ color: "var(--chat-action, #e4dfdb)" }}>
          <FormattedText text={m.content} names={names} />
          {edited}
        </p>
      </article>
    );
  }

  // azione
  return (
    <article className={cn("group rounded-2xl px-4 py-3", mine ? "bg-flamingo/10" : "bg-white/5")}>
      <header className="mb-1 flex items-baseline gap-2">
        <span className={cn("font-heading text-lg tracking-wide", mine ? "text-flamingo" : "text-peach")}>
          {m.character_name}
          {to}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{time}</span>
        {tools}
      </header>
      <p className="text-[0.95rem] leading-relaxed whitespace-pre-line" style={{ color: "var(--chat-action, #e4dfdb)" }}>
        <FormattedText text={m.content} names={names} />
        {edited}
      </p>
    </article>
  );
}

/** Correzione inline del proprio messaggio */
export function EditBox({ message, maxLength, onDone }: { message: Message; maxLength: number; onDone: (text: string | null) => void }) {
  const [text, setText] = useState(message.content);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-flamingo/40 bg-night/60 p-3">
      <p className="text-xs text-muted-foreground">Correggi il messaggio: si può fare una volta sola.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={maxLength}
        rows={3}
        className="w-full resize-y rounded-lg border border-input bg-night/40 px-3 py-2 text-sm outline-none focus-visible:border-ring"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone(null)}>
          <X /> Annulla
        </Button>
        <Button type="button" size="sm" disabled={!text.trim() || text.trim() === message.content} onClick={() => onDone(text.trim())}>
          <Check /> Salva
        </Button>
      </div>
    </div>
  );
}

/** Per chi non è entrato: righe sfocate al posto dei messaggi */
export function BlurredRows({ count }: { count: number }) {
  const rows = Math.min(count, 6);
  return (
    <div aria-hidden className="flex flex-col gap-3 opacity-60 blur-[3px] select-none">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-2xl bg-white/5 px-4 py-3">
          <div className="mb-2 h-3 w-28 rounded bg-peach/40" />
          <div className="h-3 w-full rounded bg-white/15" />
          <div className="mt-1.5 h-3 rounded bg-white/15" style={{ width: `${55 + ((i * 17) % 40)}%` }} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Dadi ------------------------------ */

export type DiceAttribute = { id: string; code: string; name: string };
export type DiceSkill = { id: string; name: string; attribute_id: string };

/** Pannello del tiro Interlock: caratteristica da sola o abilità */
export function DicePanel({
  roomId,
  characterId,
  attributes,
  skills,
  onClose,
  onError,
}: {
  roomId: string;
  characterId: string;
  attributes: DiceAttribute[];
  skills: DiceSkill[];
  onClose: () => void;
  onError: (e: string | null) => void;
}) {
  const [choice, setChoice] = useState("");
  const [pending, setPending] = useState(false);

  async function roll() {
    const [type, id] = choice.split(":");
    if (!id) return;
    setPending(true);
    onError(null);
    const skill = type === "s" ? skills.find((s) => s.id === id) : null;
    const res = await rollDice(roomId, characterId, skill ? skill.attribute_id : id, skill ? skill.id : null);
    setPending(false);
    if (res.error) onError(res.error);
    else onClose();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-peach/30 bg-night/80 p-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <Dices className="size-4 text-peach" />
        <p className="font-heading text-lg tracking-wide text-peach">Tiro Interlock</p>
        <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-muted-foreground hover:bg-white/10" aria-label="Chiudi">
          <X className="size-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        1d10 + caratteristica (+ abilità) + vantaggi e svantaggi. Il 10 naturale aggiunge un d10, l&apos;1 naturale lo toglie. Il tiro lo fa il server.
      </p>
      <div className="flex gap-2">
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none focus-visible:border-ring"
        >
          <option value="">Scegli cosa tirare…</option>
          <optgroup label="Solo caratteristica">
            {attributes.map((a) => (
              <option key={a.id} value={`a:${a.id}`}>
                {a.name} ({a.code})
              </option>
            ))}
          </optgroup>
          {attributes.map((a) => (
            <optgroup key={a.id} label={`Abilità · ${a.name}`}>
              {skills
                .filter((s) => s.attribute_id === a.id)
                .map((s) => (
                  <option key={s.id} value={`s:${s.id}`}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <Button type="button" onClick={roll} disabled={!choice || pending} className="h-10 rounded-full">
          <Dices /> Tira
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ Modalità master ------------------------------ */

export function MasterPanel({
  roomId,
  characterId,
  active,
  onClose,
  onError,
}: {
  roomId: string;
  characterId: string;
  active: { min: number; max: number } | null;
  onClose: () => void;
  onError: (e: string | null) => void;
}) {
  const [min, setMin] = useState(active?.min ?? 300);
  const [max, setMax] = useState(active?.max ?? 1500);
  const [pending, setPending] = useState(false);

  async function run(a: number, b: number | null) {
    setPending(true);
    onError(null);
    const res = await setMasterMode(roomId, characterId, a, b);
    setPending(false);
    if (res.error) onError(res.error);
    else onClose();
  }

  const num = "h-10 w-24 rounded-lg border border-input bg-night/40 px-2 text-sm outline-none focus-visible:border-ring";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-orchid/40 bg-night/80 p-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <p className="font-heading text-lg tracking-wide text-orchid">Modalità master</p>
        <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-muted-foreground hover:bg-white/10" aria-label="Chiudi">
          <X className="size-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Fissa il minimo e il massimo di caratteri delle azioni in questa chat. Si spegne da sola quando la chat si svuota.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          Minimo
          <input type="number" min={0} max={4000} value={min} onChange={(e) => setMin(Number(e.target.value))} className={num} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Massimo
          <input type="number" min={1} max={4000} value={max} onChange={(e) => setMax(Number(e.target.value))} className={num} />
        </label>
        <Button type="button" disabled={pending} onClick={() => run(min, max)} className="h-10 rounded-full">
          {active ? "Aggiorna" : "Attiva"}
        </Button>
        {active && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(0, null)} className="h-10 rounded-full">
            Spegni
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Chat su invito ------------------------------ */

/** Barra degli ospiti (dal Westeros: RoomAccessBar) */
export function RoomAccessBar({
  roomId,
  ownerName,
  guests,
  canManage,
  onChanged,
}: {
  roomId: string;
  ownerName: string | null;
  guests: { id: string; name: string }[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await inviteToRoom(roomId, name);
    setPending(false);
    if (res.error) return setError(res.error);
    setName("");
    onChanged();
  }

  async function expel(id: string, who: string) {
    if (!window.confirm(`Allontanare ${who} da questa chat?`)) return;
    const res = await expelFromRoom(roomId, id);
    if (res.error) setError(res.error);
    else onChanged();
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-night/40 px-4 py-2 text-xs sm:px-6">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
        <Lock className="size-3.5 text-lavender" />
        <span>
          Chat su invito{ownerName ? ` di ${ownerName}` : ""}.
        </span>
        {guests.length > 0 ? (
          <>
            <span>Invitati:</span>
            {guests.map((g) => (
              <span key={g.id} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-foreground">
                {g.name}
                {canManage && (
                  <button type="button" onClick={() => expel(g.id, g.name)} className="text-muted-foreground hover:text-destructive" aria-label={`Allontana ${g.name}`}>
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
          </>
        ) : (
          <span>Nessun invitato.</span>
        )}
      </p>
      {canManage && (
        <form onSubmit={invite} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Nome e cognome del personaggio da invitare"
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-night/40 px-2 text-xs outline-none focus-visible:border-ring"
          />
          <Button type="submit" size="sm" disabled={pending || name.trim().length < 2} className="rounded-full">
            <UserPlus /> Invita
          </Button>
        </form>
      )}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  );
}
