import Page from "@/app/(gioco)/universita/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /universita si apre in una finestra sopra la pagina
export default function Modal({ searchParams }: { searchParams?: Promise<{ pg?: string }> }) {
  return (
    <PageModal label="Università" width={900} height={680}>
      <Page searchParams={searchParams} />
    </PageModal>
  );
}
