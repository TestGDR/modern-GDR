"use client";

// Numero delle cose da leggere nel titolo della scheda del browser, es.
// "(3) Mappa · Modern GDR": somma dei messaggi ON e OFF e dei ticket.
// Ogni fonte imposta il proprio numero; il titolo mostra la somma.

const counts = new Map<string, number>();

export function setTitleCount(source: string, n: number) {
  counts.set(source, n);
  applyTitleCount();
}

/** Riapplica il numero (da chiamare anche quando cambia pagina, perché cambia il titolo) */
export function applyTitleCount() {
  if (typeof document === "undefined") return;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const base = document.title.replace(/^\(\d+\) /, "");
  document.title = total > 0 ? `(${total}) ${base}` : base;
}
