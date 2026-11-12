import { Suspense } from "react";
import { GameSidebar, SidebarFrame, SidebarShell } from "@/components/game/game-sidebar";
import { MainWatch, MAIN_ID } from "@/components/game/main-watch";
import { ModalGate, ModalReopen } from "@/components/game/page-modal";
import { MessageButtonsFallback } from "@/components/game/message-buttons";
import { AdminTopIcon, PlayerGuide, PlayerCommunity, PlayerIdle, PlayerGossip, PlayerMessages, PlayerPortrait, PortraitFallback, TopBar } from "@/components/game/top-bar";
import { DuskBackdrop } from "@/components/scenery/sunset-sky";

// Struttura dell'area di gioco:
// - barra laterale (fissa su desktop, cassetto dal pulsante menu su mobile):
//   immagine della chat, Aggiorna/Mappa/Esci, icone delle funzioni, presenti online
// - barra in alto: al centro messaggi OFF, ritratto del personaggio, telefono
// Social, forum, scheda, messaggi e gestione si aprono in finestre (slot @modal).
export default function GameLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <SidebarShell>
      <div className="relative flex min-h-dvh flex-1">
        <DuskBackdrop />

        <Suspense fallback={<aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-sidebar-border bg-sidebar lg:block" />}>
          <SidebarFrame>
            <GameSidebar
              newsSlot={
                <Suspense>
                  <PlayerGuide />
                </Suspense>
              }
              gossipSlot={
                <Suspense>
                  <PlayerGossip />
                </Suspense>
              }
              communitySlot={
                <Suspense>
                  <PlayerCommunity />
                </Suspense>
              }
            />
          </SidebarFrame>
        </Suspense>

        <TopBar
          admin={
            <Suspense>
              <AdminTopIcon />
            </Suspense>
          }
          messages={
            <Suspense fallback={<MessageButtonsFallback center={<PortraitFallback />} />}>
              <PlayerMessages
                center={
                  <Suspense fallback={<PortraitFallback />}>
                    <PlayerPortrait />
                  </Suspense>
                }
              />
            </Suspense>
          }
        />

        {/* Area centrale: riquadro fisso tra barra laterale e barra in alto, con il suo scorrimento */}
        <main className="fixed inset-x-0 bottom-0 top-[calc(5rem+env(safe-area-inset-top))] overflow-y-auto overscroll-contain lg:top-24 lg:left-72">
          <div id={MAIN_ID} className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
        </main>

        {/* Pagina di sotto rimasta nascosta per errore: si rimostra */}
        <Suspense fallback={null}>
          <MainWatch />
        </Suspense>

        {/* Uscita per inattività */}
        <Suspense fallback={null}>
          <PlayerIdle />
        </Suspense>

        {/* Finestre aperte sopra la pagina (scheda, social, forum, messaggi, gestione) */}
        <Suspense fallback={null}>
          <ModalGate>{modal}</ModalGate>
        </Suspense>
        {/* Indirizzo di una finestra aperto direttamente: si riapre sopra la pagina di sotto */}
        <Suspense fallback={null}>
          <ModalReopen />
        </Suspense>
      </div>
    </SidebarShell>
  );
}
