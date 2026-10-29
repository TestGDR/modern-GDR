import { Suspense } from "react";
import { ForumShell } from "@/components/game/forum-shell";
import { LoadingBlocks } from "@/components/game/loading";
import { PageModal } from "@/components/game/page-modal";

// Il forum in finestra: la finestra e la colonna di sinistra restano aperte
// passando da una sezione all'altra; cambia solo la parte centrale
export default function ForumModalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageModal label="Forum" width={1100} height={720}>
      <Suspense fallback={<LoadingBlocks />}>
        <ForumShell>{children}</ForumShell>
      </Suspense>
    </PageModal>
  );
}
