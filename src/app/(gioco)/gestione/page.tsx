import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission, visibleSections } from "@/lib/admin";

export const metadata: Metadata = { title: "Gestione" };

export default function GestionePage() {
  return (
    <>
      <PageHeader title="Gestione" subtitle="Pannello riservato allo staff." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePermission("admin.accedere");
  const sections = visibleSections(player);
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Sei <strong className="text-foreground">{player.level.name}</strong>: vedi solo le sezioni consentite al tuo livello.
      </p>
      {sections.length === 0 && (
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">Il tuo livello non ha ancora sezioni del pannello.</p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {sections.map(({ href, title, description, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="glass flex items-center gap-4 rounded-2xl p-4 transition-colors hover:bg-white/10">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet to-flamingo">
                <Icon className="size-5 text-white" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-xl tracking-wide">{title}</span>
                <span className="block text-sm text-muted-foreground">{description}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
