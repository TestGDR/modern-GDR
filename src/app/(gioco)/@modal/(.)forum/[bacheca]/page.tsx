import Page from "@/app/(gioco)/forum/[bacheca]/page";

// Cliccando dentro il gioco, /forum/[bacheca] si apre in una finestra (vedi ../layout.tsx)
export default function Modal(props: PageProps<"/forum/[bacheca]">) {
  return <Page {...props} />;
}
