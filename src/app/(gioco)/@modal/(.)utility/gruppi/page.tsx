import Page from "@/app/(gioco)/utility/gruppi/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /utility/gruppi si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Utility" width={900} height={640}>
      <Page />
    </PageModal>
  );
}
