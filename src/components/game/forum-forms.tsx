"use client";

import { useActionState, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { FormMessage } from "@/components/auth/auth-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createThread, replyToThread } from "@/lib/actions/forum";
import type { FormState } from "@/lib/types";

const initial: FormState = {};

// l'editor si carica solo nel browser
const RichEditor = dynamic(() => import("@/components/guide/rich-editor").then((m) => m.RichEditor), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-2xl bg-white/5" />,
});

// Si scrive sempre con l'utente: il suo nome è quello del personaggio (niente alias)
type NewThreadProps = { boardId: string; boardSlug: string };

export function NewThreadForm({ boardId, boardSlug }: NewThreadProps) {
  const [state, action, pending] = useActionState(createThread, initial);
  const [body, setBody] = useState("");
  const router = useRouter();
  // discussione aperta: la si apre (nella stessa finestra del forum)
  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="board_id" value={boardId} />
      <input type="hidden" name="board_slug" value={boardSlug} />
      <FormMessage state={state} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Titolo</Label>
        <Input id="title" name="title" required minLength={3} maxLength={120} className="h-10 bg-night/40" />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Messaggio</Label>
        <input type="hidden" name="body" value={body} />
        <RichEditor value={body} onChange={setBody} minHeight="min-h-48" />
      </div>
      <Button type="submit" disabled={pending || !!state.redirectTo} className="self-end rounded-full px-6">
        {pending ? "Pubblicazione…" : "Apri discussione"}
      </Button>
    </form>
  );
}

type ReplyProps = { threadId: string };

export function ReplyForm({ threadId }: ReplyProps) {
  const [state, action, pending] = useActionState(replyToThread, initial);
  const [body, setBody] = useState("");
  // l'editor si ricrea vuoto dopo una risposta pubblicata
  const [round, setRound] = useState(0);

  // Svuota il campo dopo una risposta pubblicata
  useEffect(() => {
    if (!state.success) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- risposta pubblicata: editor vuoto
    setBody("");
    setRound((r) => r + 1);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="body" value={body} />
      {state.error && <FormMessage state={state} />}
      <RichEditor key={round} value={body} onChange={setBody} minHeight="min-h-36" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={pending} className="ml-auto rounded-full px-6">
          {pending ? "Invio…" : "Rispondi"}
        </Button>
      </div>
    </form>
  );
}
