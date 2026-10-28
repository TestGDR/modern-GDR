import { Suspense } from "react";
import { SheetModal, SheetModalLoading } from "@/components/game/sheet-modal";
import { OtherSheet } from "@/components/game/sheet-content";

// Le schede degli altri personaggi si aprono nella stessa finestra
export default function CharacterModal({ params }: PageProps<"/scheda/[id]">) {
  return (
    <SheetModal>
      <Suspense fallback={<SheetModalLoading />}>
        <Content params={params} />
      </Suspense>
    </SheetModal>
  );
}

async function Content({ params }: { params: PageProps<"/scheda/[id]">["params"] }) {
  const { id } = await params;
  return <OtherSheet id={id} variant="modal" />;
}
