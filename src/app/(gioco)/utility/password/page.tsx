import type { Metadata } from "next";
import { Suspense } from "react";
import { ChangePasswordForm } from "@/components/auth/auth-forms";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility } from "@/components/game/utility";
import { requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Cambio password" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Cambio password" subtitle="La password con cui entri nel gioco: serve quella attuale." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePlayer();
  return <ChangePasswordForm />;
}
