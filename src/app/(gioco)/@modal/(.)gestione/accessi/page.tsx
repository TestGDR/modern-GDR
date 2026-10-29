import Page from "@/app/(gioco)/gestione/accessi/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /gestione/accessi si apre in una finestra sopra la pagina
export default function Modal(props: PageProps<"/gestione/accessi">) {
  return (
    <PageModal label="Gestione" width={960} height={680}>
      <Page {...props} />
    </PageModal>
  );
}
