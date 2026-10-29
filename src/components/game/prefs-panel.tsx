"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playSound, soundsOf, type SoundGroup } from "@/lib/notify-sound";
import { DEFAULT_PREFS, TEXT_SCALES, applyPrefs, cachedPrefs, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const field = "h-10 rounded-lg border border-input bg-night/40 px-3 text-sm outline-none focus-visible:border-ring";

const SOUND_ROWS: { group: SoundGroup; key: "sound_on" | "sound_off" | "sound_chat"; label: string; hint: string }[] = [
  { group: "on", key: "sound_on", label: "Telefono", hint: "Messaggi e chiamate tra personaggi" },
  { group: "off", key: "sound_off", label: "Messaggi OFF", hint: "Messaggi fuori gioco, ticket e avvisi del sito" },
  { group: "chat", key: "sound_chat", label: "Chat", hint: "Quando un altro scrive nella chat in cui sei" },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-mint/70" : "bg-white/15")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", checked ? "left-5.5" : "left-0.5")} />
      </button>
      {label}
    </label>
  );
}

/** Preferenze dell'account (dal Westeros: Opzioni della scheda) */
export function PrefsPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [prefs, setPrefs] = useState<Prefs>(() => (typeof window === "undefined" ? DEFAULT_PREFS : (cachedPrefs() ?? DEFAULT_PREFS)));
  const [saved, setSaved] = useState<Prefs | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  useEffect(() => {
    loadPrefs(supabase).then((p) => {
      setPrefs(p);
      setSaved(p);
    });
  }, [supabase]);

  // Anteprima immediata; uscendo senza salvare si torna a quelle salvate
  useEffect(() => {
    applyPrefs(prefs);
  }, [prefs]);
  useEffect(() => {
    return () => {
      const p = cachedPrefs();
      if (p) applyPrefs(p);
    };
  }, []);

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setStatus("idle");
    setPrefs((p) => ({ ...p, [k]: v }));
  };
  const changed = saved !== null && JSON.stringify(saved) !== JSON.stringify(prefs);

  async function save() {
    setStatus("saving");
    const ok = await savePrefs(supabase, prefs);
    if (!ok) return setStatus("error");
    setSaved(prefs);
    applyPrefs(prefs);
    setStatus("done");
  }

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-xl bg-white/5 p-4">
        <h3 className="font-heading text-xl tracking-wide text-peach">Suoni</h3>
        <Toggle checked={prefs.sounds_on} onChange={(v) => set("sounds_on", v)} label="Suoni accesi" />
        <label className="flex flex-col gap-1.5 text-sm">
          <span>Volume: {prefs.volume}</span>
          <input type="range" min={0} max={100} step={5} value={prefs.volume} onChange={(e) => set("volume", Number(e.target.value))} className="accent-flamingo" />
        </label>
        {SOUND_ROWS.map((row) => (
          <div key={row.key} className="flex flex-col gap-1 text-sm">
            <span>
              {row.label} <span className="text-xs text-muted-foreground">· {row.hint}</span>
            </span>
            <div className="flex gap-2">
              <select value={prefs[row.key]} onChange={(e) => set(row.key, e.target.value)} className={cn(field, "min-w-0 flex-1")}>
                {soundsOf(row.group).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" onClick={() => playSound(prefs[row.key])} className="h-10 rounded-full" aria-label={`Prova il suono ${row.label}`}>
                <Play /> Prova
              </Button>
            </div>
          </div>
        ))}
        <Toggle checked={prefs.chat_sound_on} onChange={(v) => set("chat_sound_on", v)} label="Suono della chat (si può spegnere solo questo)" />
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-white/5 p-4">
        <h3 className="font-heading text-xl tracking-wide text-peach">Testo e colori della chat</h3>
        <label className="flex flex-col gap-1.5 text-sm">
          Grandezza del testo
          <select value={prefs.text_scale} onChange={(e) => set("text_scale", Number(e.target.value))} className={field}>
            {TEXT_SCALES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} ({t.value}%)
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 text-sm">
            <input type="color" value={prefs.speech_color} onChange={(e) => set("speech_color", e.target.value)} className="size-10 cursor-pointer rounded-lg border border-input bg-transparent" />
            Parlato (tra «» o &quot;&quot;)
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="color" value={prefs.action_color} onChange={(e) => set("action_color", e.target.value)} className="size-10 cursor-pointer rounded-lg border border-input bg-transparent" />
            Testo dell&apos;azione
          </label>
        </div>
        <p className="rounded-lg bg-night/50 px-3 py-2 text-sm leading-relaxed" style={{ color: "var(--chat-action)" }}>
          Lena si appoggia al bancone. <span className="font-semibold" style={{ color: "var(--chat-speech)" }}>«Stasera si va a South Beach?»</span> chiede sorridendo.
        </p>
        <button
          type="button"
          onClick={() => {
            set("speech_color", DEFAULT_PREFS.speech_color);
            set("action_color", DEFAULT_PREFS.action_color);
          }}
          className="w-fit text-xs text-muted-foreground underline hover:text-foreground"
        >
          Colori predefiniti
        </button>
      </section>

      <div className="flex items-center justify-end gap-3">
        {status === "done" && !changed && <span className="text-sm text-mint">Salvate.</span>}
        {status === "error" && <span className="text-sm text-destructive">Salvataggio non riuscito. Riprova.</span>}
        <Button type="button" onClick={save} disabled={!changed || status === "saving"} className="rounded-full">
          <Save /> Salva le preferenze
        </Button>
      </div>
    </div>
  );
}
