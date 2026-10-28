import Page from "@/app/(gioco)/ticket/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /ticket si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Ticket" width={900} height={680}>
      <Page />
    </PageModal>
  );
}
