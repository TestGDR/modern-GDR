import { BookOpenCheck, Gauge, Layers, ListChecks, ScrollText, Settings2, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react";

// Sezioni del pannello di gestione e permesso necessario per ognuna.
// Chi non ha il permesso non vede la sezione e la pagina risponde "non trovata".

export type AdminSection = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Basta uno di questi permessi */
  permissions: string[];
};

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/gestione/caratteristiche", title: "Caratteristiche", description: "Sigle, nomi, ordine e caratteristiche attive", icon: Gauge, permissions: ["regole.gestire"] },
  { href: "/gestione/abilita", title: "Abilità", description: "Elenco delle abilità e caratteristica collegata", icon: Sparkles, permissions: ["regole.gestire"] },
  { href: "/gestione/scelte", title: "Vantaggi, svantaggi e tratti", description: "Anche il tenore di vita: costi in PX ed effetti", icon: ListChecks, permissions: ["regole.gestire"] },
  { href: "/gestione/elenchi", title: "Elenchi della scheda", description: "Indirizzi di studio, anni di corso, squadre e club", icon: BookOpenCheck, permissions: ["elenchi.gestire"] },
  { href: "/gestione/impostazioni", title: "Impostazioni del sistema", description: "Punti, età, PX, massimali e anno di gioco", icon: Settings2, permissions: ["impostazioni.gestire"] },
  { href: "/gestione/livelli", title: "Livelli e permessi", description: "Livelli utente, rango e azioni consentite", icon: ShieldCheck, permissions: ["livelli.gestire"] },
  { href: "/gestione/utenti", title: "Utenti", description: "Cerca gli utenti e cambia il loro livello", icon: Users, permissions: ["livelli.assegnare", "utenti.vedere_modificare"] },
  { href: "/gestione/registro", title: "Registro delle azioni", description: "Chi ha modificato cosa, e quando", icon: ScrollText, permissions: ["log.vedere"] },
];

export const ADMIN_HOME = { href: "/gestione", title: "Gestione", icon: Layers, permission: "admin.accedere" };

/** Nomi leggibili delle tabelle nel registro */
export const ENTITY_LABELS: Record<string, string> = {
  user_levels: "Livello",
  game_settings: "Impostazione",
  attributes: "Caratteristica",
  skills: "Abilità",
  sheet_options: "Elenco della scheda",
  creation_options: "Vantaggio/svantaggio/tratto",
  profiles: "Livello di un utente",
};
