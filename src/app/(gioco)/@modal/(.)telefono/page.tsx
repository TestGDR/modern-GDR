import Page from "@/app/(gioco)/telefono/page";
import { PageModal } from "@/components/game/page-modal";

// Cliccando dentro il gioco, /telefono si apre in una finestra sopra la pagina
export default function Modal(props: PageProps<"/telefono">) {
  return (
    <PageModal label="Telefono" width={760} height={760}>
      <Page {...props} />
    </PageModal>
  );
}
