import Page from "@/app/(gioco)/forum/[bacheca]/[discussione]/page";

// Cliccando dentro il gioco, /forum/[bacheca]/[discussione] si apre in una finestra (vedi ../../layout.tsx)
export default function Modal(props: PageProps<"/forum/[bacheca]/[discussione]">) {
  return <Page {...props} />;
}
