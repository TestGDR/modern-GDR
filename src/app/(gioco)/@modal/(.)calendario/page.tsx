import Page from "@/app/(gioco)/calendario/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /calendario si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Calendario" width={760} height={680}>
      <Page />
    </PageModal>
  );
}
