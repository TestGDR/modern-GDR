import {
  BookOpenCheck,
  BriefcaseBusiness,
  FileSearch,
  Fingerprint,
  Gauge,
  Gem,
  Landmark,
  Layers,
  LifeBuoy,
  ListChecks,
  Map as MapIcon,
  MessageSquareText,
  MessagesSquare,
  ScrollText,
  Settings2,
  ShieldCheck,
  Shield,
  Sparkles,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Sezioni del pannello di gestione e permesso necessario per ognuna.
// Chi non ha il permesso non vede la sezione e la pagina risponde "non trovata".

/** Categorie della pagina Gestione, in quest'ordine */
export const ADMIN_CATEGORIES = [
  { key: "regole", title: "Regole del gioco", description: "Il sistema Interlock: come si crea e come cresce un personaggio." },
  { key: "mondo", title: "Mondo e comunicazione", description: "Dove si gioca e dove si parla: mappe, chat, forum, ticket." },
  { key: "economia", title: "Lavori, gruppi ed economia", description: "Organizzazioni della land e soldi dei personaggi." },
  { key: "utenti", title: "Utenti e permessi", description: "Chi entra nel sito e cosa può fare." },
  { key: "controllo", title: "Controllo e manutenzione", description: "Rileggere quello che è successo e tenere pulito il sito." },
] as const;
export type AdminCategory = (typeof ADMIN_CATEGORIES)[number]["key"];

export type AdminSection = {
  href: string;
  title: string;
  description: string;
  category: AdminCategory;
  icon: LucideIcon;
  /** Basta uno di questi permessi */
  permissions: string[];
};

export const ADMIN_SECTIONS: AdminSection[] = [
  // Regole del gioco
  { href: "/gestione/impostazioni", category: "regole", title: "Impostazioni del sistema", description: "I numeri delle regole: punti alla creazione, età, PX, massimali, soglie di riuscita e anno di gioco.", icon: Settings2, permissions: ["impostazioni.gestire"] },
  { href: "/gestione/caratteristiche", category: "regole", title: "Caratteristiche", description: "Le caratteristiche dei personaggi (INT, RIF, VIG…): sigla, nome, ordine e quali sono attive.", icon: Gauge, permissions: ["regole.gestire"] },
  { href: "/gestione/abilita", category: "regole", title: "Abilità", description: "Le abilità che si comprano in scheda e la caratteristica a cui è legata ciascuna.", icon: Sparkles, permissions: ["regole.gestire"] },
  { href: "/gestione/scelte", category: "regole", title: "Vantaggi, svantaggi e tratti", description: "Le voci scelte in creazione: costo in PX ed eventuale bonus o malus sui tiri.", icon: ListChecks, permissions: ["regole.gestire"] },
  { href: "/gestione/patrimonio", category: "regole", title: "Patrimonio", description: "Il tenore di vita: costo in PX, entrata e mantenimento mensili, quota iniziale in banca.", icon: Gem, permissions: ["regole.gestire"] },
  { href: "/gestione/elenchi", category: "regole", title: "Elenchi della scheda", description: "Le voci a tendina della scheda: indirizzi di studio, anni di corso, squadre e club.", icon: BookOpenCheck, permissions: ["elenchi.gestire"] },
  // Mondo e comunicazione
  { href: "/gestione/mondo", category: "mondo", title: "Mondo", description: "Mappe, quartieri e chat: immagini, posizione dei punti sulla mappa, accesso e gruppi di chat.", icon: MapIcon, permissions: ["mondo.gestire"] },
  { href: "/gestione/chat", category: "mondo", title: "Chat", description: "Regole delle chat di gioco: lunghezza massima dei messaggi, quanto restano visibili, uscita per inattività.", icon: MessagesSquare, permissions: ["mondo.gestire"] },
  { href: "/gestione/forum", category: "mondo", title: "Forum", description: "Categorie e sezioni del forum, con chi può leggerle (tutti, livelli o gruppi).", icon: MessageSquareText, permissions: ["forum.sezioni"] },
  { href: "/gestione/ticket", category: "mondo", title: "Sezioni dei ticket", description: "Le categorie dei ticket di assistenza e le istruzioni mostrate a chi ne apre uno.", icon: LifeBuoy, permissions: ["ticket.categorie"] },
  // Lavori, gruppi ed economia
  { href: "/gestione/lavori", category: "economia", title: "Lavori", description: "Lavori full time e part time: ruoli, stipendi e personaggi assegnati.", icon: BriefcaseBusiness, permissions: ["lavori.gestire"] },
  { href: "/gestione/gruppi", category: "economia", title: "Gruppi", description: "I gruppi della land: ruoli, stipendi e membri (li assegna solo lo staff).", icon: Shield, permissions: ["gruppi.gestire"] },
  { href: "/gestione/banca", category: "economia", title: "Banca", description: "I conti dei personaggi: dare o togliere soldi e vedere tutti i movimenti.", icon: Landmark, permissions: ["banca.gestire"] },
  // Utenti e permessi
  { href: "/gestione/utenti", category: "utenti", title: "Utenti", description: "Tutti gli iscritti: livello, ultimo accesso e ultima giocata, inattivi, sospensioni.", icon: Users, permissions: ["livelli.assegnare", "utenti.vedere_modificare", "utenti.bandire"] },
  { href: "/gestione/livelli", category: "utenti", title: "Livelli e permessi", description: "I livelli dello staff e dei giocatori (Amministratore, Master, Moderatore…) e cosa può fare ciascuno.", icon: ShieldCheck, permissions: ["livelli.gestire"] },
  { href: "/gestione/iscrizioni", category: "utenti", title: "Iscrizioni", description: "Aprire o chiudere le registrazioni di nuovi account.", icon: UserPlus, permissions: ["iscrizioni.gestire"] },
  { href: "/gestione/accessi", category: "utenti", title: "Accessi", description: "Ogni accesso al sito: indirizzo IP, paese e controllo delle VPN.", icon: Fingerprint, permissions: ["gestione.accessi"] },
  // Controllo e manutenzione
  { href: "/gestione/log", category: "controllo", title: "Log", description: "Rileggere le chat di gioco, il telefono e i messaggi OFF, anche quelli cancellati.", icon: FileSearch, permissions: ["chat.log", "messaggi.log"] },
  { href: "/gestione/registro", category: "controllo", title: "Registro delle azioni", description: "Chi dello staff ha modificato cosa nel pannello, e quando.", icon: ScrollText, permissions: ["log.vedere"] },
  { href: "/gestione/manutenzione", category: "controllo", title: "Manutenzione", description: "Pulizia del sito: messaggi vecchi e account inattivi, con anteprima prima di cancellare.", icon: Wrench, permissions: ["manutenzione.sito"] },
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
  maps: "Mappa",
  locations: "Quartiere",
  room_groups: "Gruppo di chat",
  rooms: "Chat",
  chat_settings: "Impostazioni della chat",
  ticket_sections: "Sezione dei ticket",
  forum_sections: "Sezione del forum",
  forum_boards: "Bacheca del forum",
  gossip_settings: "Impostazioni dei pettegolezzi",
  signup_settings: "Iscrizioni",
  guide_macros: "Guida: macrosezione",
  guide_sections: "Guida: sottosezione",
  guide_pages: "Guida: discussione",
  jobs: "Lavoro",
  job_roles: "Ruolo di un lavoro",
  game_groups: "Gruppo",
  group_roles: "Ruolo di un gruppo",
  chat: "Manutenzione: chat",
  messaggi: "Manutenzione: messaggi",
  account: "Manutenzione: account",
};
