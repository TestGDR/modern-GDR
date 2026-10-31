// La mappa che si sta guardando (pagina Mappa): la legge la barra laterale per
// mostrare nome, immagine e descrizione. È solo uno stato dell'interfaccia
// (quale scheda della mappa è aperta), tenuto per la sessione del browser.

const KEY = "moderngdr-mappa-scelta";
const EVENT = "moderngdr:mappa-scelta";

export function readCurrentMap(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setCurrentMap(id: string) {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    // senza sessionStorage vale solo l'evento
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

/** Avvisa quando cambia la mappa scelta */
export function onCurrentMap(fn: (id: string) => void) {
  const handler = (e: Event) => fn((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
