import type { Metadata } from "next";
import Link from "next/link";
import { BookUser, BriefcaseBusiness, Drama, KeyRound, Landmark, PenLine, Shield, ShoppingBag, Sparkles, VenetianMask } from "lucide-react";
import { PageHeader } from "@/components/game/page-header";

export const metadata: Metadata = { title: "Utility" };

// Le sezioni, divise per argomento
const GROUPS = [
  {
    title: "Città e persone",
    boxes: [
      { href: "/utility/anagrafe", label: "Anagrafe", hint: "Tutti gli iscritti della land", icon: BookUser, color: "text-mint" },
      { href: "/utility/prestavolti", label: "Prestavolti", hint: "I volti scelti, e la registrazione del tuo", icon: VenetianMask, color: "text-orchid" },
      { href: "/utility/prestatalento", label: "Prestatalento", hint: "I talenti scelti, e la registrazione del tuo", icon: Sparkles, color: "text-mint" },
      { href: "/utility/png", label: "PNG", hint: "I personaggi non giocanti della città e i tuoi", icon: Drama, color: "text-orchid" },
    ],
  },
  {
    title: "Lavoro e gruppi",
    boxes: [
      { href: "/utility/lavori", label: "Lavori", hint: "Full time e part time: scegli il tuo", icon: BriefcaseBusiness, color: "text-peach" },
      { href: "/utility/gruppi", label: "Gruppi", hint: "Gruppi di gioco e squadre sportive", icon: Shield, color: "text-lavender" },
    ],
  },
  {
    title: "Soldi e acquisti",
    boxes: [
      { href: "/utility/banca", label: "Servizi bancari", hint: "Stipendio, conto e soldi agli altri", icon: Landmark, color: "text-sand" },
      { href: "/utility/mercato", label: "Mercato", hint: "Oggetti, alcolici e sigarette con il tuo conto", icon: ShoppingBag, color: "text-flamingo" },
    ],
  },
  {
    title: "Account",
    boxes: [
      { href: "/utility/nome", label: "Cambio nome", hint: "Nome e cognome: una volta sola", icon: PenLine, color: "text-flamingo" },
      { href: "/utility/password", label: "Cambio password", hint: "La password con cui entri nel gioco", icon: KeyRound, color: "text-sand" },
    ],
  },
];

// Pannello Utility: le sezioni si aprono nella stessa finestra
export default function UtilityPage() {
  return (
    <>
      <PageHeader title="Utility" subtitle="Anagrafe, PNG, lavori e gruppi, banca e mercato, il tuo account." />
      <div className="flex flex-col gap-5">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 border-b border-white/10 pb-1 font-heading text-xl tracking-wide text-peach">{g.title}</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {g.boxes.map((b) => (
                <li key={b.href}>
                  <Link href={b.href} className="glass group flex h-full flex-col items-center gap-1 rounded-xl p-3 text-center transition-colors hover:bg-white/10">
                    <b.icon className={`size-6 ${b.color} transition-transform group-hover:scale-110`} />
                    <span className="font-heading text-lg leading-tight tracking-wide">{b.label}</span>
                    <span className="text-[0.7rem] leading-snug text-muted-foreground">{b.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
