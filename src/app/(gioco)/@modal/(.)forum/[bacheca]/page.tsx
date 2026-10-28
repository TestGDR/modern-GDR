import Page from "@/app/(gioco)/forum/[bacheca]/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /forum/[bacheca] si apre in una finestra sopra la pagina
export default function Modal(props: PageProps<"/forum/[bacheca]">) {
  return (
    <PageModal label="Forum">
      <Page {...props} />
    </PageModal>
  );
}
