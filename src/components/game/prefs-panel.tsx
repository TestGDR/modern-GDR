"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playSound, soundsOf, type SoundGroup } from "@/lib/notify-sound";
import {
  CHAT_AVATARS,
  CHAT_FONT_FAMILIES,
  CHAT_FONT_SIZES,
  CHAT_LINES,
  DEFAULT_PREFS,
  applyPrefs,
  loadPrefs,
  savePrefs,
  savedPrefs,
  type ChatFontFamily,
  type ChatLine,
  type Prefs,
} from "@/lib/prefs";
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
  const [prefs, setPrefs] = useState<Prefs>(() => savedPrefs() ?? DEFAULT_PREFS);
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
      const p = savedPrefs();
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
        <p className="text-xs text-muted-foreground">Si cambiano anche dalla chat, con il pulsante Impostazioni.</p>
        <ChatPrefsFields prefs={prefs} set={set} />
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

type SetPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;

/** Grandezze, carattere, interlinea, colori e ritratti della chat (scheda e pulsante in chat) */
function ChatPrefsFields({ prefs, set }: { prefs: Prefs; set: SetPref }) {
  const sizes = (key: "chat_font_pt" | "chat_other_pt", label: string, normal: number) => (
    <label className="flex flex-col gap-1.5 text-sm">
      {label}
      <select value={prefs[key]} onChange={(e) => set(key, Number(e.target.value))} className={field}>
        {CHAT_FONT_SIZES.map((pt) => (
          <option key={pt} value={pt}>
            {pt} pt{pt === normal ? " (normale)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
  const color = (key: "speech_color" | "action_color" | "name_color", label: React.ReactNode) => (
    <label className="flex items-center gap-3 text-sm">
      <input type="color" value={prefs[key]} onChange={(e) => set(key, e.target.value)} className="size-10 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent" />
      {label}
    </label>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sizes("chat_font_pt", "Grandezza delle azioni", DEFAULT_PREFS.chat_font_pt)}
        {sizes("chat_other_pt", "Grandezza degli altri messaggi (dadi, sussurri, OFF)", DEFAULT_PREFS.chat_other_pt)}
        <label className="flex flex-col gap-1.5 text-sm">
          Carattere delle azioni
          <select value={prefs.chat_font_family} onChange={(e) => set("chat_font_family", e.target.value as ChatFontFamily)} className={field}>
            {CHAT_FONT_FAMILIES.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Interlinea delle azioni
          <select value={prefs.chat_line} onChange={(e) => set("chat_line", e.target.value as ChatLine)} className={field}>
            {CHAT_LINES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {color("speech_color", <>Parlato (tra «» o &quot;&quot;)</>)}
        {color("action_color", <>Testo dell&apos;azione</>)}
        {color("name_color", <>Nomi degli altri</>)}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        Ritratti in chat
        <div className="flex gap-1.5">
          {CHAT_AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => set("chat_avatars", a.id)}
              className={cn("rounded-full border px-3 py-1 text-xs", prefs.chat_avatars === a.id ? "border-flamingo bg-flamingo/25 text-white" : "border-white/15 text-muted-foreground hover:bg-white/5")}
              aria-pressed={prefs.chat_avatars === a.id}
            >
              {a.label}
            </button>
          ))}
        </div>
        {prefs.chat_avatars === "nascosti" && <span className="text-xs text-muted-foreground">Senza ritratti non c&apos;è nemmeno il pulsante del look accanto.</span>}
      </div>
      {/* anteprima con le impostazioni scelte */}
      <div className="flex flex-col gap-1.5 rounded-lg bg-night/50 px-3 py-2">
        <p>
          <span className="font-heading text-lg tracking-wide" style={{ color: "var(--chat-name)" }}>
            Lena
          </span>
        </p>
        <p className="whitespace-pre-line" style={{ color: "var(--chat-action)", fontSize: "var(--chat-font, 11pt)", fontFamily: "var(--chat-family, inherit)", lineHeight: "var(--chat-line, 1.625)" }}>
          Si appoggia al bancone e sistema gli occhiali da sole. <span className="font-semibold" style={{ color: "var(--chat-speech)" }}>«Stasera si va a La Jolla?»</span> chiede sorridendo, mentre
          il sole scende sull&apos;oceano.
        </p>
        <p className="text-muted-foreground" style={{ fontSize: "var(--chat-other, 10pt)" }}>
          <span className="mr-1 rounded bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wider uppercase">OFF</span> Torno tra cinque minuti!
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          for (const k of ["chat_font_pt", "chat_other_pt", "chat_font_family", "chat_line", "speech_color", "action_color", "name_color", "chat_avatars"] as const) {
            set(k, DEFAULT_PREFS[k]);
          }
        }}
        className="w-fit text-xs text-muted-foreground underline hover:text-foreground"
      >
        Torna alle impostazioni predefinite
      </button>
    </div>
  );
}

/** Pulsante Impostazioni della chat: solo testo, colori e ritratti, con anteprima nella chat dietro */
export function ChatPrefsPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [prefs, setPrefs] = useState<Prefs>(() => savedPrefs() ?? DEFAULT_PREFS);
  const [saved, setSaved] = useState<Prefs | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  useEffect(() => {
    loadPrefs(supabase).then((p) => {
      setPrefs(p);
      setSaved(p);
    });
  }, [supabase]);
  // anteprima subito nella chat; chiudendo senza salvare si torna a quelle salvate
  useEffect(() => {
    applyPrefs(prefs);
  }, [prefs]);
  useEffect(() => {
    return () => {
      const p = savedPrefs();
      if (p) applyPrefs(p);
    };
  }, []);

  const set: SetPref = (k, v) => {
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
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">Le vedi solo tu e valgono su ogni computer e telefono. La chat dietro cambia subito: salva per tenerle.</p>
      <ChatPrefsFields prefs={prefs} set={set} />
      <div className="flex items-center justify-end gap-3">
        {status === "done" && !changed && <span className="text-sm text-mint">Salvate.</span>}
        {status === "error" && <span className="text-sm text-destructive">Salvataggio non riuscito. Riprova.</span>}
        <Button type="button" onClick={save} disabled={!changed || status === "saving"} className="rounded-full">
          <Save /> Salva
        </Button>
      </div>
    </div>
  );
}
