import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { ForumManager } from "@/components/admin/forum-manager";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePermission } from "@/lib/admin";
import { getForumSections } from "@/lib/data";

export const metadata: Metadata = { title: "Forum: sezioni e bacheche" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Forum" subtitle="Sezioni e bacheche del forum." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePermission("forum.sezioni");
  return <ForumManager sections={await getForumSections()} />;
}
