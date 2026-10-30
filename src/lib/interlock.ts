// Regole del sistema Interlock usate dal sito (browser e server).
// Tutti i numeri arrivano dalle impostazioni del database (game_settings):
// qui c'è solo la logica, nessun valore di gioco scritto fisso.
// Le stesse regole le ricontrolla il database in submit_character().

import type { Attribute, CreationOption, GameSetting, Skill } from "@/lib/types";

export type InterlockSettings = {
  attrMin: number;
  attrMax: number;
  attrMinCreation: number;
  attrPoints: number;
  /** Massimali alla creazione, dal più alto al più basso */
  maxes: number[];
  ageMin: number;
  ageMax: number;
  gameYear: number;
  pxStart: number;
  skillMax: number;
  pxPerLevel: number;
  modifierCap: number;
  /** Massimi delle voci del catalogo */
  traitLimits: { adv: number; advAcademic: number; advSport: number; dis: number; traits: number; ambAdv: number; ambInterp: number; ambDis: number };
};

/** Legge le impostazioni dalle righe di game_settings */
export function parseSettings(rows: GameSetting[]): InterlockSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const v = map.get(key);
    return typeof v === "number" ? v : Number(v ?? fallback) || fallback;
  };
  const maxes = map.get("massimali_creazione");
  return {
    attrMin: num("caratteristica_min", 1),
    attrMax: num("caratteristica_max", 10),
    attrMinCreation: num("caratteristica_min_creazione", 2),
    attrPoints: num("punti_caratteristiche", 36),
    maxes: Array.isArray(maxes) ? [...maxes].map(Number).sort((a, b) => b - a) : [],
    ageMin: num("eta_min", 18),
    ageMax: num("eta_max", 25),
    gameYear: num("anno_di_gioco", 0),
    pxStart: num("px_iniziali", 0),
    skillMax: num("abilita_max", 10),
    pxPerLevel: num("costo_px_livello", 10),
    modifierCap: num("tetto_modificatori", 4),
    traitLimits: {
      adv: num("voci_max_vantaggi", 5),
      advAcademic: num("voci_max_vantaggi_accademici", 2),
      advSport: num("voci_max_vantaggi_sportivi", 2),
      dis: num("voci_max_svantaggi", 5),
      traits: num("voci_max_tratti", 3),
      ambAdv: num("voci_max_amb_vantaggi", 4),
      ambInterp: num("voci_max_amb_interpretativi", 2),
      ambDis: num("voci_max_amb_svantaggi", 4),
    },
  };
}

/* ----------------------------- Caratteristiche ----------------------------- */

/** Massimale consentito per la posizione `i` (valori ordinati dal più alto) */
function maxAt(settings: InterlockSettings, i: number) {
  if (settings.maxes.length === 0) return settings.attrMax;
  return settings.maxes[i] ?? settings.maxes[settings.maxes.length - 1];
}

/** I valori rispettano i massimali? (es. un solo 10, un solo 9…) */
export function respectsMaxes(values: number[], settings: InterlockSettings) {
  return [...values].sort((a, b) => b - a).every((v, i) => v <= maxAt(settings, i));
}

export function maxesLabel(settings: InterlockSettings) {
  return settings.maxes.join(", ");
}

export function attributePointsUsed(values: number[]) {
  return values.reduce((sum, v) => sum + v, 0);
}

/* ----------------------------- Abilità e PX ----------------------------- */

/** PX totali per portare un'abilità da 0 a `level` (10 × livello raggiunto, sommati) */
export function skillCost(level: number, settings: InterlockSettings) {
  return (settings.pxPerLevel * level * (level + 1)) / 2;
}

export type PxSummary = {
  start: number;
  /** Somma dei costi delle voci scelte (vantaggi, tratti, tenore; gli svantaggi sono negativi) */
  options: number;
  skills: number;
  remaining: number;
};

export function pxSummary(
  chosenOptions: CreationOption[],
  skillLevels: Record<string, number>,
  settings: InterlockSettings,
  details: Record<string, { level: number }> = {},
): PxSummary {
  const options = chosenOptions.reduce((sum, o) => sum + o.cost_px * (details[o.id]?.level ?? 1), 0);
  const skills = Object.values(skillLevels).reduce((sum, l) => sum + skillCost(l, settings), 0);
  return { start: settings.pxStart, options, skills, remaining: settings.pxStart - options - skills };
}

/* ----------------------------- Date ----------------------------- */

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(month: number, year: number) {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}

/** Data di nascita "AAAA-MM-GG" se esiste, altrimenti null */
export function birthDateFor(age: number, day: number, month: number, settings: InterlockSettings) {
  const year = settings.gameYear - age;
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(month, year)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const MONTHS = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

export function formatBirthDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/* ----------------------------- Controlli ----------------------------- */

export type Build = {
  sex: string | null;
  age: number | null;
  birthDay: number | null;
  birthMonth: number | null;
  nationality: string;
  attributes: Record<string, number>;
  optionIds: string[];
  optionDetails: Record<string, { level: number; choice: string }>;
  skills: Record<string, number>;
  studyTrackId: string | null;
  yearId: string | null;
};

export type Anomaly = { step: number; message: string };

/**
 * Problemi che impediscono l'invio. Il sito non cancella nulla da solo:
 * li mostra nel passaggio interessato e nel riepilogo.
 */
export function findAnomalies(
  build: Build,
  data: { attributes: Attribute[]; skills: Skill[]; options: CreationOption[] },
  settings: InterlockSettings,
): Anomaly[] {
  const out: Anomaly[] = [];

  // 1. Dati anagrafici
  if (!build.sex || !build.age || !build.nationality.trim()) out.push({ step: 1, message: "Completa sesso, età e nazionalità." });
  if (build.age && (build.age < settings.ageMin || build.age > settings.ageMax)) {
    out.push({ step: 1, message: `L'età deve essere tra ${settings.ageMin} e ${settings.ageMax} anni.` });
  }
  if (!build.age || !build.birthDay || !build.birthMonth || !birthDateFor(build.age, build.birthDay, build.birthMonth, settings)) {
    out.push({ step: 1, message: "Inserisci una data di nascita valida." });
  }

  // 2. Caratteristiche
  const values = data.attributes.map((a) => build.attributes[a.id]).filter((v): v is number => typeof v === "number");
  if (values.length < data.attributes.length) out.push({ step: 2, message: "Imposta tutte le caratteristiche." });
  const used = attributePointsUsed(values);
  if (used !== settings.attrPoints) {
    out.push({ step: 2, message: `Devi spendere esattamente ${settings.attrPoints} punti caratteristica (ne hai usati ${used}).` });
  }
  if (!respectsMaxes(values, settings)) {
    out.push({ step: 2, message: `Le caratteristiche superano i massimali consentiti (${maxesLabel(settings)}).` });
  }

  // 3. Scelte
  const chosen = data.options.filter((o) => build.optionIds.includes(o.id));
  if (chosen.filter((o) => o.kind === "tenore").length !== 1) out.push({ step: 3, message: "Scegli il patrimonio." });
  if (chosen.some((o) => o.incompatible_ids.some((id) => build.optionIds.includes(id)))) {
    out.push({ step: 3, message: "Hai scelto voci incompatibili tra loro." });
  }
  for (const o of chosen) {
    if (!o.available) out.push({ step: 3, message: `"${o.name}" non si può ancora scegliere: toglila.` });
    const choice = build.optionDetails[o.id]?.choice?.trim() ?? "";
    if (o.requires_choice && o.requires_choice !== "master" && !choice) out.push({ step: 3, message: `"${o.name}": indica ${o.choice_hint || "la scelta richiesta"}.` });
    const same = chosen.find((x) => o.same_choice_incompatible_ids.includes(x.id) && (build.optionDetails[x.id]?.choice ?? "").trim().toLowerCase() === choice.toLowerCase());
    if (same && o.name < same.name) out.push({ step: 3, message: `"${o.name}" e "${same.name}" non vanno insieme sulla stessa scelta.` });
  }
  for (const [label, count, max] of traitCounts(chosen, settings)) {
    if (count > max) out.push({ step: 3, message: `Troppi ${label}: ${count} su ${max}.` });
  }

  // 4. Abilità
  for (const skill of data.skills) {
    const level = build.skills[skill.id] ?? 0;
    if (level > (build.attributes[skill.attribute_id] ?? 0)) {
      out.push({ step: 4, message: `${skill.name} (${level}) supera la caratteristica collegata.` });
    }
  }
  const px = pxSummary(chosen, build.skills, settings, build.optionDetails);
  if (px.remaining < 0) out.push({ step: 4, message: `Hai speso ${-px.remaining} PX in più di quelli disponibili.` });

  // 5. Background
  if (!build.studyTrackId || !build.yearId) out.push({ step: 5, message: "Scegli indirizzo di studio e anno di corso." });

  return out;
}

/** Quante voci per gruppo e il loro massimo (le stesse regole di check_character_options) */
export function traitCounts(chosen: CreationOption[], settings: InterlockSettings): [string, number, number][] {
  const l = settings.traitLimits;
  const n = (f: (o: CreationOption) => boolean) => chosen.filter(f).length;
  return [
    ["vantaggi", n((o) => o.kind === "vantaggio" && o.scope !== "ambientazione"), l.adv],
    ["vantaggi accademici", n((o) => o.kind === "vantaggio" && o.scope === "accademica"), l.advAcademic],
    ["vantaggi sportivi", n((o) => o.kind === "vantaggio" && o.scope === "sportiva"), l.advSport],
    ["svantaggi", n((o) => o.kind === "svantaggio" && o.scope !== "ambientazione"), l.dis],
    ["tratti", n((o) => o.kind === "tratto" && !o.is_origin), l.traits],
    ["provenienze", n((o) => o.is_origin), 1],
    ["vantaggi di ambientazione", n((o) => o.kind === "vantaggio" && o.scope === "ambientazione"), l.ambAdv],
    ["vantaggi interpretativi", n((o) => o.kind === "vantaggio" && o.scope === "ambientazione" && o.subgroup === "interpretativo"), l.ambInterp],
    ["svantaggi di ambientazione", n((o) => o.kind === "svantaggio" && o.scope === "ambientazione"), l.ambDis],
  ];
}
