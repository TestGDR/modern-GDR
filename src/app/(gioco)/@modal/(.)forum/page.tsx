import Page from "@/app/(gioco)/forum/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, il forum si apre in una finestra (sempre la stessa, anche cambiando sezione)
export default function Modal() {
  return (
    <PageModal label="Forum" width={1100} height={720}>
      <Page />
    </PageModal>
  );
}
