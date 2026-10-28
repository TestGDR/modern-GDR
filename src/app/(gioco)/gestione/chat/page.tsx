import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { ChatSettingsEditor } from "@/components/admin/chat-settings-editor";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getChatSettings } from "@/lib/data";

export const metadata: Metadata = { title: "Impostazioni della chat" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Chat" subtitle="Regole comuni a tutte le chat di gioco." />
      <Suspense fallback={<LoadingBlocks count={1} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("mondo.gestire");
  return <ChatSettingsEditor settings={await getChatSettings()} />;
}
