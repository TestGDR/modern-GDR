"use client";

import { Download, FileText, SendHorizontal } from "lucide-react";
import { FloatingWindow } from "@/components/floating-window";
import { Button } from "@/components/ui/button";
import { KIND_LABEL } from "@/lib/chat";
import { firstName } from "@/lib/format";
import type { Message, MessageKind } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Azioni proprie necessarie per salvare la chat */
export const SAVE_MIN_ACTIONS = 3;

/** Finestra di un comando della chat (dadi, oggetti, blocco note…): si chiude solo con la X */
export function ChatToolWindow({
  title,
  icon,
  tone = "text-peach",
  width = 420,
  onClose,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  tone?: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <FloatingWindow
      label={title}
      onClose={onClose}
      initialWidth={width}
      header={
        <p className={cn("flex items-center gap-2 pb-3 font-heading text-2xl tracking-wide", tone)}>
          {icon}
          {title}
        </p>
      }
    >
      {children}
    </FloatingWindow>
  );
}

/** Blocco note: si prepara l'azione con calma e la si manda in chat; dopo l'invio si svuota */
export function NotepadPanel({
  value,
  onChange,
  onSend,
  sending,
  maxLength,
  kind,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  maxLength: number;
  kind: MessageKind;
}) {
  const left = maxLength - value.length;
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={10}
        placeholder="Scrivi qui la tua azione con calma: resta qui finché non la mandi."
        aria-label="Blocco note"
        className="min-h-40 w-full resize-y rounded-xl border border-input bg-night/40 px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("text-xs", left < 50 ? "text-peach" : "text-muted-foreground")}>
          Si invia come «{KIND_LABEL[kind]}» · {left} caratteri
        </span>
        <Button type="button" size="sm" disabled={sending || !value.trim()} onClick={onSend} className="ml-auto rounded-full">
          <SendHorizontal /> Invia in chat
        </Button>
      </div>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Chi parla, come si legge nel file salvato */
function speaker(m: Message): string {
  const who = m.kind === "png" ? m.character_name : firstName(m.character_name);
  switch (m.kind) {
    case "master":
      return "Master";
    case "sussurro":
      return `${who} sussurra a ${m.recipient ? firstName(m.recipient) : "…"}`;
    case "fuori_gioco":
      return `${who} (OFF)`;
    case "png":
      return `${who} (PNG)`;
    default:
      return m.recipient && m.kind === "azione" ? `${who} → ${m.recipient}` : who;
  }
}

function asText(roomName: string, messages: Message[]): string {
  const lines = messages.map((m) => (m.kind === "sistema" ? `[${stamp(m.created_at)}] ${firstName(m.character_name)} ${m.content}` : `[${stamp(m.created_at)}] ${speaker(m)}: ${m.content}`));
  return `${roomName}\nSalvata il ${new Date().toLocaleString("it-IT")}\n\n${lines.join("\n\n")}\n`;
}

function asHtml(roomName: string, messages: Message[]): string {
  const rows = messages
    .map((m) => {
      const body = escapeHtml(m.content).replace(/\n/g, "<br>");
      if (m.kind === "sistema") return `<p class="sys">${stamp(m.created_at)} · <b>${escapeHtml(firstName(m.character_name))}</b> ${body}</p>`;
      return `<div class="msg ${m.kind}"><div class="head"><b>${escapeHtml(speaker(m))}</b><span>${stamp(m.created_at)}</span></div><p>${body}</p></div>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(roomName)}</title>
<style>
body{margin:0;padding:24px 16px;background:#1a1230;color:#e4dfdb;font:16px/1.6 system-ui,sans-serif}
main{max-width:760px;margin:0 auto}
h1{margin:0;color:#ffb38a;letter-spacing:.05em}
.date{color:#a9a1b8;font-size:13px;margin:4px 0 24px}
.msg{background:rgba(255,255,255,.05);border-radius:14px;padding:10px 14px;margin:10px 0}
.msg p{margin:4px 0 0;white-space:normal}
.head{display:flex;gap:8px;align-items:baseline}
.head b{color:#ffb38a}.head span{margin-left:auto;color:#a9a1b8;font-size:12px}
.master{background:rgba(160,90,200,.2)}.master .head b{color:#e48fe0}
.sussurro{background:rgba(120,90,200,.2)}.sussurro .head b{color:#c8b8ff}
.fuori_gioco{background:none;color:#a9a1b8}
.png .head b{color:#e48fe0}
.dado .head b,.combattimento .head b{color:#ff8fab}
.sys{text-align:center;color:#a9a1b8;font-size:13px}
</style></head>
<body><main><h1>${escapeHtml(roomName)}</h1><p class="date">Salvata il ${escapeHtml(new Date().toLocaleString("it-IT"))}</p>
${rows}
</main></body></html>
`;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Salva chat: scarica i messaggi visibili in HTML o testo, se ho scritto almeno 3 azioni */
export function SaveChatPanel({ roomName, messages, myActions }: { roomName: string; messages: Message[]; myActions: number }) {
  const allowed = myActions >= SAVE_MIN_ACTIONS;
  const base = `${roomName.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "chat"}-${new Date().toISOString().slice(0, 10)}`;
  return (
    <div className="flex flex-col gap-3 text-sm">
      {allowed ? (
        <>
          <p className="text-muted-foreground">Scarica i {messages.length} messaggi che vedi ora in questa chat.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="rounded-full" onClick={() => download(`${base}.html`, asHtml(roomName, messages), "text/html")}>
              <Download /> Scarica HTML
            </Button>
            <Button type="button" size="sm" variant="ghost" className="rounded-full border border-white/15" onClick={() => download(`${base}.txt`, asText(roomName, messages), "text/plain")}>
              <FileText /> Scarica testo (.txt)
            </Button>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">
          Per salvare la chat devi avere scritto almeno {SAVE_MIN_ACTIONS} azioni in questa giocata (per ora {myActions === 1 ? "ne hai 1" : `ne hai ${myActions}`}).
        </p>
      )}
    </div>
  );
}
