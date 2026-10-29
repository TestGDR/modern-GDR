import Page from "@/app/(gioco)/social/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /social si apre in una finestra sopra la pagina
export default function Modal(props: PageProps<"/social">) {
  return (
    <PageModal label="Social" width={620} height={760}>
      <Page {...props} />
    </PageModal>
  );
}
