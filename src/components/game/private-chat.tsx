"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { PrivateMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

type PrivateChatProps = {
  myId: string;
  otherId: string;
  initialMessages: PrivateMessage[];
};

/** Conversazione privata: invio e ricezione in tempo reale. */
export function PrivateChat({ myId, otherId, initialMessages }: PrivateChatProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  function add(message: PrivateMessage) {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`pm:${myId}:${otherId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages", filter: `recipient_id=eq.${myId}` },
        async (payload) => {
          const message = payload.new as PrivateMessage;
          if (message.sender_id !== otherId) return;
          add(message);
          // La conversazione è aperta: il messaggio è letto
          await supabase.from("private_messages").update({ read_at: new Date().toISOString() }).eq("id", message.id);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, otherId]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setError(null);
    setBody("");
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("private_messages")
      .insert({ sender_id: myId, recipient_id: otherId, body: text })
      .select("*")
      .single<PrivateMessage>();
    if (insertError || !data) {
      setBody(text);
      setError("Messaggio non inviato. Riprova.");
      return;
    }
    add(data);
  }

  return (
    <>
      <ol ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <li className="m-auto text-sm text-muted-foreground">Nessun messaggio. Scrivi tu per primo.</li>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === myId;
          return (
            <li
              key={m.id}
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                mine
                  ? "self-end rounded-br-sm bg-gradient-to-br from-flamingo to-peach text-primary-foreground"
                  : "self-start rounded-bl-sm bg-white/10",
              )}
            >
              <p className="whitespace-pre-line">{m.body}</p>
              <p className={cn("mt-0.5 text-right text-[0.65rem]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {formatDateTime(m.created_at)}
                {mine && m.read_at && " · letto"}
              </p>
            </li>
          );
        })}
      </ol>

      <form onSubmit={send} className="flex flex-col gap-1 border-t border-border p-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Scrivi un messaggio…"
            maxLength={4000}
            className="h-10 bg-night/40"
          />
          <Button type="submit" size="icon-lg" className="size-10" aria-label="Invia">
            <SendHorizontal />
          </Button>
        </div>
      </form>
    </>
  );
}
