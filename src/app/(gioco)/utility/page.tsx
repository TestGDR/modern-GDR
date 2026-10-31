import type { Metadata } from "next";
import Link from "next/link";
import { BookUser, BriefcaseBusiness, Drama, Landmark, PenLine, Shield, ShoppingBag, Sparkles, VenetianMask } from "lucide-react";
import { PageHeader } from "@/components/game/page-header";

export const metadata: Metadata = { title: "Utility" };

const BOXES = [
  { href: "/utility/anagrafe", label: "Anagrafe", hint: "Tutti gli iscritti della land", icon: BookUser, color: "text-mint" },
  { href: "/utility/prestavolti", label: "Anagrafe prestavolti", hint: "I volti scelti, e la registrazione del tuo", icon: VenetianMask, color: "text-orchid" },
  { href: "/utility/prestatalento", label: "Anagrafe prestatalento", hint: "I talenti scelti, e la registrazione del tuo", icon: Sparkles, color: "text-mint" },
  { href: "/utility/png", label: "PNG", hint: "I personaggi non giocanti della città e i tuoi", icon: Drama, color: "text-orchid" },
  { href: "/utility/lavori", label: "Lavori", hint: "Full time e part time: scegli il tuo", icon: BriefcaseBusiness, color: "text-peach" },
  { href: "/utility/gruppi", label: "Gruppi", hint: "Gruppi della land, ruoli e membri", icon: Shield, color: "text-lavender" },
  { href: "/utility/mercato", label: "Mercato", hint: "Compra oggetti, alcolici e sigarette con il tuo conto", icon: ShoppingBag, color: "text-flamingo" },
  { href: "/utility/banca", label: "Servizi bancari", hint: "Stipendio, conto e soldi agli altri", icon: Landmark, color: "text-sand" },
  { href: "/utility/nome", label: "Cambio nome", hint: "Nome e cognome: una volta sola", icon: PenLine, color: "text-flamingo" },
];

// Pannello Utility: le sezioni si aprono nella stessa finestra
export default function UtilityPage() {
  return (
    <>
      <PageHeader title="Utility" subtitle="Anagrafe, prestavolti, prestatalento, PNG, lavori, gruppi, servizi bancari e cambio nome." />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BOXES.map((b) => (
          <li key={b.href}>
            <Link href={b.href} className="glass group flex h-full flex-col items-center gap-2 rounded-2xl p-5 text-center transition-colors hover:bg-white/10">
              <b.icon className={`size-9 ${b.color} transition-transform group-hover:scale-110`} />
              <span className="font-heading text-2xl tracking-wide">{b.label}</span>
              <span className="text-xs text-muted-foreground">{b.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
