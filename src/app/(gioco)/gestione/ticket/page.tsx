import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { TicketSectionsManager } from "@/components/admin/ticket-sections-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import type { TicketSection } from "@/lib/types";

export const metadata: Metadata = { title: "Sezioni dei ticket" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Sezioni dei ticket" subtitle="Categorie e istruzioni per chi scrive allo staff." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("ticket.categorie");
  const supabase = await createClient();
  const { data } = await supabase.from("ticket_sections").select("*").order("sort_order").order("name").overrideTypes<TicketSection[], { merge: false }>();
  return <TicketSectionsManager sections={data ?? []} />;
}
