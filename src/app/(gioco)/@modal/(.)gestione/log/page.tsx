import Page from "@/app/(gioco)/gestione/log/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /gestione/log si apre in una finestra sopra la pagina
export default function Modal(props: PageProps<"/gestione/log">) {
  return (
    <PageModal label="Gestione" width={960} height={680}>
      <Page {...props} />
    </PageModal>
  );
}
