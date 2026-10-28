import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { TicketsApp } from "@/components/game/tickets-app";
import { can, requirePlayer } from "@/lib/auth";
import { getRulesData } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { TicketSection } from "@/lib/types";

export const metadata: Metadata = { title: "Ticket" };

export default function TicketPage() {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const player = await requirePlayer();
  const supabase = await createClient();
  const [{ data: sections }, rules] = await Promise.all([
    supabase.from("ticket_sections").select("*").order("sort_order").order("name").overrideTypes<TicketSection[], { merge: false }>(),
    getRulesData(),
  ]);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="font-heading text-3xl tracking-wide">Ticket</h1>
        <p className="text-sm text-muted-foreground">Le tue richieste allo staff: problemi, scheda, regole, segnalazioni, eventi.</p>
      </div>
      <TicketsApp
        sections={sections ?? []}
        canManage={can(player, "ticket.gestire")}
        attributes={rules.attributes.map((a) => ({ id: a.id, code: a.code, name: a.name }))}
        skills={rules.skills.map((s) => ({ id: s.id, name: s.name, attribute_id: s.attribute_id }))}
      />
    </div>
  );
}
