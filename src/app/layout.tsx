import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Geist, Geist_Mono, Pacifico } from "next/font/google";
import { siteConfig } from "@/config/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Titoli in stile poster
const bebas = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
});

// Logo in stile cartolina
const pacifico = Pacifico({
  variable: "--font-pacifico",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} · ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  // iPhone e iPad: «Aggiungi alla schermata Home» apre il gioco a schermo intero
  appleWebApp: {
    capable: true,
    title: siteConfig.name,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#2a2150",
  viewportFit: "cover",
};

// Grafica giorno/notte prima del primo disegno: copia tecnica della preferenza (quella vera è nel database,
// user_prefs.theme, e applyPrefs la rimette appena arriva), così chi ha scelto la notte non vede lampi di giorno
const THEME_SCRIPT = `try{if(localStorage.getItem("gdr_grafica")==="notte")document.documentElement.dataset.theme="notte"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bebas.variable} ${pacifico.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
