import Page from "@/app/(gioco)/giornale/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /giornale si apre in una finestra sopra la pagina
export default function Modal() {
  return (
    <PageModal label="Campus Wire" width={1000} height={740}>
      <Page />
    </PageModal>
  );
}
