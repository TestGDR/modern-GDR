import {
  CircleUserRound,
  House,
  Map,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  Send,
  type LucideIcon,
} from "lucide-react";

// Nome e testi del sito: cambiali qui e si aggiornano ovunque.
export const siteConfig = {
  name: "Modern GDR",
  tagline: "Florida Roleplay",
  description:
    "Un GDR play by chat ambientato a Miami, Florida: chat di gioco, messaggi privati, mappe, forum e social.",
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Mostrata nella barra in basso su mobile */
  mobile: boolean;
};

export const gameNav: NavItem[] = [
  { href: "/bacheca", label: "Bacheca", icon: House, mobile: true },
  { href: "/mappa", label: "Mappa", icon: Map, mobile: true },
  { href: "/chat", label: "Chat", icon: MessageCircle, mobile: true },
  { href: "/messaggi", label: "Messaggi", icon: Send, mobile: true },
  { href: "/social", label: "Social", icon: Newspaper, mobile: true },
  { href: "/forum", label: "Forum", icon: MessagesSquare, mobile: false },
  { href: "/scheda", label: "Scheda", icon: CircleUserRound, mobile: false },
];
