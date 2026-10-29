import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { SignupsManager } from "@/components/admin/site-managers";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Iscrizioni" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Iscrizioni" subtitle="Apri o chiudi le nuove registrazioni." />
      <Suspense fallback={<LoadingBlocks count={1} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("iscrizioni.gestire");
  const supabase = await createClient();
  const { data } = await supabase.from("signup_settings").select("open, message").maybeSingle<{ open: boolean; message: string }>();
  return <SignupsManager open={data?.open ?? true} message={data?.message ?? ""} />;
}
