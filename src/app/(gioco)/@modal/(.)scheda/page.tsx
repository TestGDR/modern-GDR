import { Suspense } from "react";
import { SheetModal, SheetModalLoading } from "@/components/game/sheet-modal";
import { OwnSheet } from "@/components/game/sheet-content";

// Cliccando "Scheda" dentro il gioco, /scheda si apre in questa finestra
export default function SchedaModal() {
  return (
    <SheetModal>
      <Suspense fallback={<SheetModalLoading />}>
        <OwnSheet variant="modal" />
      </Suspense>
    </SheetModal>
  );
}
