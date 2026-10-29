// Regole del nome del personaggio, che è anche il nome con cui si accede.
// Stesse regole del database: da 3 a 40 caratteri.

export const NAME_MIN = 3;
export const NAME_MAX = 40;

/** Lettere (anche accentate), spazi, apostrofo, punto e trattino; inizia e finisce con una lettera */
const NAME_RE = /^\p{L}[\p{L} '.-]*\p{L}$/u;

/** Toglie gli spazi in eccesso: "  lena   moreno " → "lena moreno" */
export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/** Il nome è una parola sola (nomi doppi con il trattino: Maria-Luisa) */
const FIRST_RE = /^\p{L}[\p{L}'.-]*\p{L}$/u;
export function isValidFirstName(first: string) {
  return first.length >= 2 && first.length <= 20 && FIRST_RE.test(first);
}

export function isValidName(name: string) {
  return name.length >= NAME_MIN && name.length <= NAME_MAX && NAME_RE.test(name);
}
