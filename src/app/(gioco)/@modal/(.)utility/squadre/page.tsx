import Page from "@/app/(gioco)/utility/squadre/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /utility/squadre si apre in una finestra sopra la pagina
export default function Modal({ searchParams }: { searchParams?: Promise<{ apri?: string }> }) {
  return (
    <PageModal label="Utility" width={900} height={640}>
      <Page searchParams={searchParams} />
    </PageModal>
  );
}
