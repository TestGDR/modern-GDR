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
  { href: "/gestione/scelte", title: "Vantaggi, svantaggi e tratti", description: "Costi in PX ed effetti sui tiri", icon: ListChecks, permissions: ["regole.gestire"] },
  { href: "/gestione/patrimonio", title: "Patrimonio", description: "Costo in PX, entrata e mantenimento mensili, quota iniziale", icon: Gem, permissions: ["regole.gestire"] },
  { href: "/gestione/elenchi", title: "Elenchi della scheda", description: "Indirizzi di studio, anni di corso, squadre e club", icon: BookOpenCheck, permissions: ["elenchi.gestire"] },
  { href: "/gestione/mondo", title: "Mondo", description: "Mappe, quartieri e chat: immagini, punti e gruppi", icon: MapIcon, permissions: ["mondo.gestire"] },
  { href: "/gestione/chat", title: "Chat", description: "Lunghezza dei messaggi, durata e uscita automatica", icon: MessagesSquare, permissions: ["mondo.gestire"] },
  { href: "/gestione/forum", title: "Forum", description: "Sezioni e bacheche del forum", icon: MessageSquareText, permissions: ["forum.sezioni"] },
  { href: "/gestione/ticket", title: "Sezioni dei ticket", description: "Categorie dei ticket e istruzioni per chi scrive", icon: LifeBuoy, permissions: ["ticket.categorie"] },
  { href: "/gestione/lavori", title: "Lavori", description: "Full time e part time: ruoli, stipendi e assegnazioni", icon: BriefcaseBusiness, permissions: ["lavori.gestire"] },
  { href: "/gestione/gruppi", title: "Gruppi", description: "Gruppi della land: ruoli, stipendi e membri", icon: Shield, permissions: ["gruppi.gestire"] },
  { href: "/gestione/banca", title: "Banca", description: "Conti dei personaggi: dare e togliere soldi, movimenti", icon: Landmark, permissions: ["banca.gestire"] },
  { href: "/gestione/impostazioni", title: "Impostazioni del sistema", description: "Punti, età, PX, massimali e anno di gioco", icon: Settings2, permissions: ["impostazioni.gestire"] },
  { href: "/gestione/livelli", title: "Livelli e permessi", description: "Livelli utente, rango e azioni consentite", icon: ShieldCheck, permissions: ["livelli.gestire"] },
  { href: "/gestione/utenti", title: "Utenti", description: "Livelli, ultimo accesso e gioco, inattivi, sospensioni", icon: Users, permissions: ["livelli.assegnare", "utenti.vedere_modificare", "utenti.bandire"] },
  { href: "/gestione/log", title: "Log", description: "Rileggi chat, messaggi ON e messaggi OFF", icon: FileSearch, permissions: ["chat.log", "messaggi.log"] },
  { href: "/gestione/accessi", title: "Accessi", description: "IP, paese e controllo VPN di ogni accesso", icon: Fingerprint, permissions: ["gestione.accessi"] },
  { href: "/gestione/iscrizioni", title: "Iscrizioni", description: "Apri o chiudi le nuove registrazioni", icon: UserPlus, permissions: ["iscrizioni.gestire"] },
  { href: "/gestione/manutenzione", title: "Manutenzione", description: "Pulizia di messaggi vecchi e account inattivi", icon: Wrench, permissions: ["manutenzione.sito"] },
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
  jobs: "Lavoro",
  job_roles: "Ruolo di un lavoro",
  game_groups: "Gruppo",
  group_roles: "Ruolo di un gruppo",
  chat: "Manutenzione: chat",
  messaggi: "Manutenzione: messaggi",
  account: "Manutenzione: account",
};
