import Page from "@/app/(gioco)/utility/dormitori/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /utility/dormitori si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Utility" width={900} height={680}>
      <Page />
    </PageModal>
  );
}
