"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { FormMessage } from "@/components/auth/auth-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createThread, replyToThread } from "@/lib/actions/forum";
import type { FormState } from "@/lib/types";

const initial: FormState = {};

// Si scrive sempre con l'utente: il suo nome è quello del personaggio (niente alias)
type NewThreadProps = { boardId: string; boardSlug: string };

export function NewThreadForm({ boardId, boardSlug }: NewThreadProps) {
  const [state, action, pending] = useActionState(createThread, initial);
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
        <Label htmlFor="body">Messaggio</Label>
        <Textarea id="body" name="body" required rows={5} maxLength={20000} className="bg-night/40" />
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
  const formRef = useRef<HTMLFormElement>(null);

  // Svuota il campo dopo una risposta pubblicata
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="thread_id" value={threadId} />
      {state.error && <FormMessage state={state} />}
      <Textarea name="body" required rows={4} maxLength={20000} placeholder="Scrivi una risposta…" className="bg-night/40" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={pending} className="ml-auto rounded-full px-6">
          {pending ? "Invio…" : "Rispondi"}
        </Button>
      </div>
    </form>
  );
}
