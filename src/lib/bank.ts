// Formati della banca, usati sia dal server sia dal browser.

const NUMBER = new Intl.NumberFormat("it-IT");

/** 1500 → "1.500 $" */
export function formatDollars(n: number) {
  return `${NUMBER.format(n)} $`;
}

/** "2026-10-30" → "30/10/2026" */
export function formatDay(day: string) {
  const [y, m, d] = day.split("-");
  return d && m && y ? `${d}/${m}/${y}` : day;
}

/** Data e ora di un movimento, con l'ora italiana */
export function formatMoment(iso: string) {
  return new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "ogni giorno", "ogni 7 giorni" */
export function periodLabel(days: number) {
  if (days === 1) return "ogni giorno";
  if (days === 30) return "al mese";
  return `ogni ${days} giorni`;
}
