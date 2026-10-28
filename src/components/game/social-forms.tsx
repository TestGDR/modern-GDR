"use client";

import { useActionState, useEffect, useRef } from "react";
import { SendHorizontal } from "lucide-react";
import { FormMessage } from "@/components/auth/auth-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addComment, createPost } from "@/lib/actions/social";
import type { FormState } from "@/lib/types";

const initial: FormState = {};

/** Svuota il modulo quando l'azione va a buon fine */
function useResetOnSuccess(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) ref.current?.reset();
  }, [state]);
  return ref;
}

export function NewPostForm({ firstName }: { firstName: string }) {
  const [state, action, pending] = useActionState(createPost, initial);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="flex flex-1 flex-col gap-2">
      {state.error && <FormMessage state={state} />}
      <Textarea name="body" required maxLength={2000} placeholder={`Cosa succede, ${firstName}?`} rows={2} className="resize-none bg-night/40" />
      <div className="flex gap-2">
        <Input name="location" maxLength={60} placeholder="Dove? (facoltativo)" className="h-9 flex-1 bg-night/40" />
        <Button type="submit" disabled={pending} className="h-9 rounded-full px-5">
          {pending ? "…" : "Pubblica"}
        </Button>
      </div>
    </form>
  );
}

export function CommentForm({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState(addComment, initial);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="flex gap-2">
      <input type="hidden" name="post_id" value={postId} />
      <Input name="body" required maxLength={1000} placeholder="Scrivi un commento…" className="h-9 bg-night/40" />
      <Button type="submit" size="icon" variant="ghost" disabled={pending} aria-label="Invia commento">
        <SendHorizontal />
      </Button>
    </form>
  );
}
