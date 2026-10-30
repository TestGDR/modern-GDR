"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type Props = { children: ReactNode; /** Cosa si stava aprendo, per il messaggio */ what?: string };
type State = { error: Error | null };

// Una nuova versione pubblicata mentre il sito era aperto: i pezzi di codice vecchi
// non esistono più. Si ricarica la pagina una volta sola.
const RELOAD_KEY = "gdr_ricarica_versione";
function isOldVersion(error: Error) {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${error.name} ${error.message}`);
}

/**
 * Se un pezzo della pagina (una sezione della scheda, una finestra) si rompe,
 * mostra un messaggio solo lì invece di bloccare tutto il gioco.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Errore in", this.props.what ?? "una parte della pagina", error, info.componentStack);
    if (isOldVersion(error)) {
      try {
        if (!sessionStorage.getItem(RELOAD_KEY)) {
          sessionStorage.setItem(RELOAD_KEY, "1");
          window.location.reload();
        }
      } catch {
        // archivio del browser non disponibile: resta il messaggio
      }
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const old = isOldVersion(error);
    return (
      <div role="alert" className="m-4 flex flex-col gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-destructive">
          <AlertTriangle className="size-4" />
          {old ? "È uscita una nuova versione del sito" : `Non è stato possibile mostrare ${this.props.what ?? "questa parte"}`}
        </p>
        <p className="text-muted-foreground">
          {old ? "Ricarica la pagina (F5) per usare la versione nuova." : "Il resto del gioco funziona. Se si ripete, manda allo staff questo messaggio:"}
        </p>
        {!old && <code className="rounded-lg bg-night/60 px-2 py-1 text-xs break-words text-foreground/80">{error.message || String(error)}</code>}
        <button
          type="button"
          onClick={() => (old ? window.location.reload() : this.setState({ error: null }))}
          className="flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/15"
        >
          <RotateCcw className="size-3.5" /> {old ? "Ricarica" : "Riprova"}
        </button>
      </div>
    );
  }
}
