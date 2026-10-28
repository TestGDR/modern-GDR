import Page from "@/app/(gioco)/messaggi/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /messaggi si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Messaggi ON">
      <Page />
    </PageModal>
  );
}
