// Ultima attività vera nel sito (mouse, tastiera, tocco, cambio pagina), condivisa
// tra le schede aperte: la usano l'uscita per inattività e i presenti online.
// È un dato tecnico del browser, non del personaggio.

const KEY = "moderngdr-ultima-attivita";

export function readLastActivity() {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeLastActivity(t: number) {
  try {
    localStorage.setItem(KEY, String(t));
  } catch {
    // senza localStorage vale solo questa scheda
  }
}
