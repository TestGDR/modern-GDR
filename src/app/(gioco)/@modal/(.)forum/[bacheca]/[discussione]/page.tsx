import Page from "@/app/(gioco)/forum/[bacheca]/[discussione]/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /forum/[bacheca]/[discussione] si apre in una finestra sopra la pagina
export default function Modal(props: PageProps<"/forum/[bacheca]/[discussione]">) {
  return (
    <PageModal label="Forum" width={1100} height={720}>
      <Page {...props} />
    </PageModal>
  );
}
