import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { BankManager, type BankAccountRow } from "@/components/admin/bank-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Banca" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Banca" subtitle="Conti dei personaggi: dai o togli soldi con un motivo, rileggi i movimenti." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("banca.gestire");
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("balance, character:characters(id, name, avatar_url)")
    .overrideTypes<BankAccountRow[], { merge: false }>();
  const rows = (data ?? []).filter((r) => r.character).sort((a, b) => a.character.name.localeCompare(b.character.name, "it"));
  return <BankManager accounts={rows} />;
}
