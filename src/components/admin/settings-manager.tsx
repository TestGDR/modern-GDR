"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { ErrorText, inputClass, useAdminAction } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { saveSetting } from "@/lib/actions/admin";
import type { GameSetting, UserLevel } from "@/lib/types";

/** Parametri del sistema, modificabili senza toccare il codice */
export function SettingsManager({ settings, levels }: { settings: GameSetting[]; levels: UserLevel[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {settings.map((s) => (
        <SettingRow key={s.key} setting={s} levels={levels} />
      ))}
    </ul>
  );
}

function toText(value: GameSetting["value"]) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function SettingRow({ setting, levels }: { setting: GameSetting; levels: UserLevel[] }) {
  const [text, setText] = useState(toText(setting.value));
  const [saved, setSaved] = useState(false);
  const { pending, error, setError, execute } = useAdminAction();
  const changed = text !== toText(setting.value);

  function save() {
    let value: number | number[] | string;
    if (setting.kind === "number") {
      value = Number(text);
      if (!Number.isInteger(value) || value < 0) return setError("Inserisci un numero intero, zero o positivo.");
    } else if (setting.kind === "decimal") {
      value = Number(text.replace(",", "."));
      if (!Number.isFinite(value) || value < 0) return setError("Inserisci un numero, anche con la virgola (es. 2,0).");
    } else if (setting.kind === "numbers") {
      value = text.split(/[,\s]+/).filter(Boolean).map(Number);
      if (value.length === 0 || value.some((n) => !Number.isInteger(n))) return setError("Inserisci dei numeri separati da virgola, es. 10, 9, 8, 8, 7.");
    } else {
      value = text;
    }
    setSaved(false);
    execute(() => saveSetting(setting.key, value), () => setSaved(true));
  }

  return (
    <li className="glass flex flex-col gap-2 rounded-2xl p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{setting.label}</p>
          <p className="text-xs text-muted-foreground">{setting.description}</p>
        </div>
        <div className="flex shrink-0 gap-2 sm:w-64">
          {setting.kind === "level" ? (
            <select className={inputClass} value={text} onChange={(e) => setText(e.target.value)} aria-label={setting.label}>
              {levels
                .filter((l) => !l.is_admin)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          ) : (
            <input
              className={inputClass}
              value={text}
              inputMode={setting.kind === "number" ? "numeric" : setting.kind === "decimal" ? "decimal" : "text"}
              onChange={(e) => {
                setText(e.target.value);
                setSaved(false);
              }}
              aria-label={setting.label}
            />
          )}
          <Button type="button" size="icon" className="size-10 shrink-0" disabled={!changed || pending} onClick={save} aria-label={`Salva ${setting.label}`}>
            <Check />
          </Button>
        </div>
      </div>
      <ErrorText error={error} />
      {saved && !changed && <p className="text-xs text-mint">Salvato.</p>}
    </li>
  );
}
