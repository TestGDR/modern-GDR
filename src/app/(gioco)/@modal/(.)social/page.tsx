import Page from "@/app/(gioco)/social/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /social si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Social">
      <Page />
    </PageModal>
  );
}
