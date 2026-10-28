"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { ErrorText, FieldLabel, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { saveChatSettings } from "@/lib/actions/world";
import { CHAT_LIMITS } from "@/lib/chat";
import type { ChatSettings } from "@/lib/types";

/** Gestione → Chat (dal Westeros: ChatSettingsEditor) */
export function ChatSettingsEditor({ settings }: { settings: ChatSettings }) {
  const [form, setForm] = useState({ maxLength: settings.max_length, ttlMinutes: settings.ttl_minutes, idleMinutes: settings.idle_minutes });
  const [saved, setSaved] = useState(false);
  const { pending, error, execute } = useAdminAction();
  const changed = form.maxLength !== settings.max_length || form.ttlMinutes !== settings.ttl_minutes || form.idleMinutes !== settings.idle_minutes;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        execute(() => saveChatSettings(form), () => setSaved(true));
      }}
      className="glass flex max-w-2xl flex-col gap-4 rounded-2xl p-4 sm:p-6"
    >
      <ErrorText error={error} />
      <FieldLabel
        label="Lunghezza massima di un messaggio"
        hint={`In caratteri, da ${CHAT_LIMITS.max_length.min} a ${CHAT_LIMITS.max_length.max}. Vale per azioni, OFF, sussurri e narrazioni (non per i dadi). Chi invia un'azione lunga esattamente quanto il limite deve aspettare che scriva un altro, oppure 10 minuti.`}
      >
        <input
          type="number"
          className={inputClass}
          min={CHAT_LIMITS.max_length.min}
          max={CHAT_LIMITS.max_length.max}
          value={form.maxLength}
          onChange={(e) => setForm({ ...form, maxLength: Number(e.target.value) })}
        />
      </FieldLabel>
      <FieldLabel
        label="Durata dei messaggi in chat"
        hint={`In minuti, da ${CHAT_LIMITS.ttl_minutes.min} a ${CHAT_LIMITS.ttl_minutes.max}. Dopo questo tempo un messaggio sparisce dalla chat (resta nel database).`}
      >
        <input
          type="number"
          className={inputClass}
          min={CHAT_LIMITS.ttl_minutes.min}
          max={CHAT_LIMITS.ttl_minutes.max}
          value={form.ttlMinutes}
          onChange={(e) => setForm({ ...form, ttlMinutes: Number(e.target.value) })}
        />
      </FieldLabel>
      <FieldLabel
        label="Uscita automatica dalla giocata"
        hint={`In minuti, da ${CHAT_LIMITS.idle_minutes.min} a ${CHAT_LIMITS.idle_minutes.max}. Chi non scrive per questo tempo esce da solo; quando esce l'ultimo la chat si svuota.`}
      >
        <input
          type="number"
          className={inputClass}
          min={CHAT_LIMITS.idle_minutes.min}
          max={CHAT_LIMITS.idle_minutes.max}
          value={form.idleMinutes}
          onChange={(e) => setForm({ ...form, idleMinutes: Number(e.target.value) })}
        />
      </FieldLabel>
      <div className="flex items-center justify-end gap-3">
        {saved && !changed && <span className="text-sm text-mint">Salvato.</span>}
        <Button type="submit" disabled={pending || !changed} className="rounded-full">
          <Save /> Salva
        </Button>
      </div>
    </form>
  );
}
