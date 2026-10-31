import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarApp } from "@/components/game/calendar-app";
import { LoadingBlocks } from "@/components/game/loading";
import { can, requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Calendario" };

// Calendario del gioco: eventi dello staff e partite delle squadre
export default function CalendarioPage() {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const player = await requirePlayer();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="font-heading text-3xl tracking-wide">Calendario</h1>
        <p className="text-sm text-muted-foreground">Feste, lezioni, appuntamenti dello staff e partite delle squadre (ora italiana).</p>
      </div>
      {/* solo per mostrare i pulsanti: la sicurezza è nelle policy (calendario.gestire) */}
      <CalendarApp canManage={can(player, "calendario.gestire")} />
    </div>
  );
}
