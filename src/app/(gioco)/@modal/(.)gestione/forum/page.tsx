import Page from "@/app/(gioco)/gestione/forum/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /gestione/forum si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Gestione" width={960} height={680}>
      <Page />
    </PageModal>
  );
}
