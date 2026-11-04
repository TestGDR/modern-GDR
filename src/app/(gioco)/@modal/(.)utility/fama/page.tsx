import Page from "@/app/(gioco)/utility/fama/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /utility/fama si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Utility" width={720} height={640}>
      <Page />
    </PageModal>
  );
}
