import Page from "@/app/(gioco)/sport/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /sport si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Sport" width={900} height={680}>
      <Page />
    </PageModal>
  );
}
