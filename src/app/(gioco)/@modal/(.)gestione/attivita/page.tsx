import Page from "@/app/(gioco)/gestione/attivita/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /gestione/attivita si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Gestione" width={960} height={680}>
      <Page />
    </PageModal>
  );
}
