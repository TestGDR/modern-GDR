import Page from "@/app/(gioco)/messaggi/[id]/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /messaggi/[id] si apre in una finestra sopra la pagina
export default function Modal(props: PageProps<"/messaggi/[id]">) {
  return (
    <PageModal label="Messaggi ON">
      <Page {...props} />
    </PageModal>
  );
}
