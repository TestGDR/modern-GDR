import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { ADMIN_CATEGORIES } from "@/config/admin";
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
      {/* Sezioni divise per categoria, a elenco, ognuna con la sua descrizione */}
      <div className="flex flex-col gap-6">
        {ADMIN_CATEGORIES.map((cat) => {
          const items = sections.filter((x) => x.category === cat.key);
          if (items.length === 0) return null;
          return (
            <section key={cat.key} aria-labelledby={`cat-${cat.key}`}>
              <h2 id={`cat-${cat.key}`} className="font-heading text-2xl tracking-wide text-peach">
                {cat.title}
              </h2>
              <p className="mb-2 text-xs text-muted-foreground">{cat.description}</p>
              <ul className="glass divide-y divide-white/10 overflow-hidden rounded-2xl">
                {items.map(({ href, title, description, icon: Icon }) => (
                  <li key={href}>
                    <Link href={href} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/10">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet to-flamingo">
                        <Icon className="size-5 text-white" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-heading text-xl leading-tight tracking-wide">{title}</span>
                        <span className="block text-sm text-muted-foreground">{description}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
