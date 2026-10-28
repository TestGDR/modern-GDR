import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { OwnSheet } from "@/components/game/sheet-content";

export const metadata: Metadata = { title: "Scheda personaggio" };

// Pagina intera: si vede aprendo /scheda direttamente.
// Cliccando "Scheda" nel gioco, invece, si apre la finestra (@modal/(.)scheda).
export default function SchedaPage() {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <OwnSheet variant="page" />
    </Suspense>
  );
}
