import { Suspense } from "react";
import { ForumShell } from "@/components/game/forum-shell";
import { LoadingBlocks } from "@/components/game/loading";

// Colonna di sinistra comune a tutto il forum: cambiando sezione resta ferma,
// cambia solo la parte centrale
export default function ForumLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <ForumShell>{children}</ForumShell>
    </Suspense>
  );
}
