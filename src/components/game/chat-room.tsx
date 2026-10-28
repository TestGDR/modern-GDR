"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessageWithCharacter } from "@/lib/data";
import { formatTime, initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/types";

type ChatRoomProps = {
  placeId: string;
  isOpen: boolean;
  me: { id: string; name: string };
  initialMessages: ChatMessageWithCharacter[];
};

/** Stanza di chat: messaggi salvati su Supabase e ricevuti in tempo reale. */
export function ChatRoom({ placeId, isOpen, me, initialMessages }: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [names, setNames] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = { [me.id]: me.name };
    for (const m of initialMessages) if (m.character) map[m.character.id] = m.character.name;
    return map;
  });
  const [action, setAction] = useState("");
  const [speech, setSpeech] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // Copia dei nomi leggibile dentro l'ascolto in tempo reale
  const namesRef = useRef(names);
  useEffect(() => {
    namesRef.current = names;
  }, [names]);

  function addMessage(message: ChatMessage) {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }

  // Nuovi messaggi in tempo reale
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${placeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `place_id=eq.${placeId}` },
        async (payload) => {
          const message = payload.new as ChatMessage;
          addMessage(message);
          if (!namesRef.current[message.character_id]) {
            const { data } = await supabase
              .from("characters")
              .select("id, name")
              .eq("id", message.character_id)
              .maybeSingle<{ id: string; name: string }>();
            if (data) setNames((n) => ({ ...n, [data.id]: data.name }));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [placeId]);

  // Scorre in fondo quando arriva un messaggio
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const a = action.trim();
    const s = speech.trim();
    if (!a && !s) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("chat_messages")
      .insert({ place_id: placeId, character_id: me.id, action: a || null, speech: s || null })
      .select("*")
      .single<ChatMessage>();
    setSending(false);
    if (insertError || !data) {
      setError("Messaggio non inviato. Riprova.");
      return;
    }
    addMessage(data);
    setAction("");
    setSpeech("");
  }

  // Invio con Ctrl/Cmd + Invio
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(e);
  }

  return (
    <div className="glass flex min-h-0 flex-1 flex-col border-t-0 lg:rounded-b-2xl">
      <ol ref={listRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.length === 0 && (
          <li className="py-10 text-center text-sm text-muted-foreground">Nessuno ha ancora scritto qui. Inizia tu la scena.</li>
        )}
        {messages.map((m) => {
          const name = names[m.character_id] ?? "…";
          return (
            <li key={m.id} className="flex gap-3">
              <CharacterAvatar initials={initials(name)} className="size-9" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className={`font-semibold ${m.character_id === me.id ? "text-flamingo" : "text-peach"}`}>{name}</span>
                  <span className="text-xs text-muted-foreground">{formatTime(m.created_at)}</span>
                </p>
                {m.action && <p className="mt-1 text-[0.95rem] leading-relaxed whitespace-pre-line text-lavender italic">{m.action}</p>}
                {m.speech && <p className="mt-1 text-[0.95rem] leading-relaxed whitespace-pre-line">«{m.speech}»</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {isOpen ? (
        <form onSubmit={send} className="flex flex-col gap-2 border-t border-border p-3 sm:p-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Textarea
            value={action}
            onChange={(e) => setAction(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Azione: cosa fa il tuo personaggio…"
            rows={2}
            maxLength={4000}
            className="min-h-0 resize-none bg-night/40 italic"
          />
          <div className="flex gap-2">
            <Textarea
              value={speech}
              onChange={(e) => setSpeech(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Parlato: cosa dice…"
              rows={1}
              maxLength={2000}
              className="min-h-0 flex-1 resize-none bg-night/40"
            />
            <Button type="submit" size="icon-lg" disabled={sending} className="h-auto self-stretch px-4" aria-label="Invia">
              <SendHorizontal />
            </Button>
          </div>
        </form>
      ) : (
        <p className="border-t border-border p-4 text-center text-sm text-muted-foreground">Questo luogo è chiuso dallo staff.</p>
      )}
    </div>
  );
}
