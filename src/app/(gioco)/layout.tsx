import Link from "next/link";
import { Suspense } from "react";
import { CircleUserRound, MessagesSquare } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { MobileNav, MobileNavFallback, SidebarNav, SidebarNavFallback } from "@/components/game/game-nav";
import { MobileSignOut, PlayerBadge } from "@/components/game/player-badge";
import { ModalGate } from "@/components/game/sheet-modal";
import { DuskBackdrop } from "@/components/scenery/sunset-sky";
import { buttonVariants } from "@/components/ui/button";

// Struttura dell'area di gioco:
// - desktop: sidebar fissa a sinistra
// - mobile: barra in alto + barra di navigazione in basso
// Il layout è statico; i dati del giocatore arrivano dentro <Suspense>.
export default function GameLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-1">
      <DuskBackdrop />

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar backdrop-blur-xl lg:flex">
        <div className="px-6 pt-7 pb-8">
          <Logo href="/bacheca" />
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <Suspense fallback={<SidebarNavFallback />}>
            <SidebarNav />
          </Suspense>
        </div>
        <Suspense fallback={<div className="m-3 h-16 animate-pulse rounded-2xl bg-white/5" />}>
          <PlayerBadge />
        </Suspense>
      </aside>

      {/* Barra in alto mobile */}
      <header className="glass fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-x-0 border-t-0 px-4 pt-[env(safe-area-inset-top)] lg:hidden">
        <Logo href="/bacheca" size="sm" />
        <div className="flex items-center gap-1">
          <Link href="/forum" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Forum">
            <MessagesSquare className="size-5" />
          </Link>
          <Link href="/scheda" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="La mia scheda">
            <CircleUserRound className="size-5" />
          </Link>
          <MobileSignOut />
        </div>
      </header>

      <main className="pb-mobile-nav flex w-full min-w-0 flex-1 flex-col pt-14 lg:pt-0 lg:pb-0 lg:pl-64">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </div>
      </main>

      {/* Finestre aperte sopra la pagina (es. la scheda del personaggio) */}
      <Suspense fallback={null}>
        <ModalGate>{modal}</ModalGate>
      </Suspense>

      <Suspense fallback={<MobileNavFallback />}>
        <MobileNav />
      </Suspense>
    </div>
  );
}
