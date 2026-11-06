"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { barButtonClass } from "@/components/game/sidebar-styles";
import { saveTheme, type Theme } from "@/lib/prefs";
import { createClient } from "@/lib/supabase/client";

// La grafica attuale si legge da <html data-theme> (la mette applyPrefs dalle preferenze del database)
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const read = (): Theme => (document.documentElement.dataset.theme === "notte" ? "notte" : "giorno");

/** Pulsante della barra in alto: passa dal giorno (tramonto) alla notte e viceversa */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "giorno" as Theme);
  const next: Theme = theme === "notte" ? "giorno" : "notte";
  return (
    <button
      type="button"
      onClick={() => void saveTheme(createClient(), next)}
      className={barButtonClass}
      title={next === "notte" ? "Passa alla grafica notturna" : "Passa alla grafica del giorno"}
      aria-label={next === "notte" ? "Grafica notturna" : "Grafica del giorno"}
    >
      {theme === "notte" ? <Sun className="text-peach" /> : <Moon className="text-lavender" />}
      {theme === "notte" ? "Giorno" : "Notte"}
    </button>
  );
}
