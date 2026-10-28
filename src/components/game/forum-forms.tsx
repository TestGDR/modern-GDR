"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage } from "@/components/auth/auth-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createThread, replyToThread } from "@/lib/actions/forum";
import type { FormState } from "@/lib/types";

const initial: FormState = {};

/** Casella "scrivi come personaggio" (attiva di default nelle bacheche On Game) */
function AsCharacter({ characterName, defaultOn }: { characterName: string | null; defaultOn: boolean }) {
  if (!characterName) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" name="as_character" defaultChecked={defaultOn} className="size-4 accent-[var(--flamingo)]" />
      Scrivi come <span className="font-medium text-foreground">{characterName}</span> (in gioco)
    </label>
  );
}

type NewThreadProps = {
  boardId: string;
  boardSlug: string;
  characterName: string | null;
  onGame: boolean;
};

export function NewThreadForm({ boardId, boardSlug, characterName, onGame }: NewThreadProps) {
  const [state, action, pending] = useActionState(createThread, initial);
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
      <AsCharacter characterName={characterName} defaultOn={onGame} />
      <Button type="submit" disabled={pending} className="self-end rounded-full px-6">
        {pending ? "Pubblicazione…" : "Apri discussione"}
      </Button>
    </form>
  );
}

type ReplyProps = { threadId: string; characterName: string | null; onGame: boolean };

export function ReplyForm({ threadId, characterName, onGame }: ReplyProps) {
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
        <AsCharacter characterName={characterName} defaultOn={onGame} />
        <Button type="submit" disabled={pending} className="ml-auto rounded-full px-6">
          {pending ? "Invio…" : "Rispondi"}
        </Button>
      </div>
    </form>
  );
}
