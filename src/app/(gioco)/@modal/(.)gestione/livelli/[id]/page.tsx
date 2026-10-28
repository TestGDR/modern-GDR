import Page from "@/app/(gioco)/gestione/livelli/[id]/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /gestione/livelli/[id] si apre in una finestra sopra la pagina
export default function Modal(props: PageProps<"/gestione/livelli/[id]">) {
  return (
    <PageModal label="Gestione" width={960} height={680}>
      <Page {...props} />
    </PageModal>
  );
}
