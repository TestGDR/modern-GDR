import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown, Map, MessageCircle, MessagesSquare, Newspaper, Send } from "lucide-react";
import { RegisteredBanner } from "@/components/auth/auth-forms";
import { Logo } from "@/components/brand/logo";
import { SunsetScene } from "@/components/scenery/sunset-sky";
import { buttonVariants } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

const features = [
  { icon: MessageCircle, title: "Chat di gioco", text: "Scene in tempo reale nei quartieri di Miami, da South Beach alle Everglades." },
  { icon: Send, title: "Messaggi privati", text: "Accordi, segreti e tradimenti, lontano da occhi indiscreti." },
  { icon: Map, title: "Mappa", text: "I quartieri di Miami da esplorare, ognuno con la sua atmosfera." },
  { icon: MessagesSquare, title: "Forum", text: "Annunci, fazioni, lavoro e tutto ciò che succede fuori dalle chat." },
  { icon: Newspaper, title: "Social", text: "Il feed dei personaggi: foto, post e pettegolezzi della città." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative isolate flex min-h-dvh flex-col overflow-hidden">
        <SunsetScene className="-z-10" />
        <nav className="flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10">
          <Logo size="sm" />
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "text-white hover:bg-white/15")}>
            Accedi
          </Link>
        </nav>

        <div className="flex flex-1 flex-col items-center px-5 pt-[12vh] text-center sm:pt-[14vh]">
          <p className="mb-3 font-heading text-lg tracking-[0.4em] text-sand/90 sm:text-xl">Play by chat</p>
          <h1 className="font-script text-6xl leading-tight text-white drop-shadow-[0_4px_24px_rgb(91_75_181/0.6)] sm:text-8xl">
            {siteConfig.name}
          </h1>
          <p className="mt-4 font-heading text-2xl tracking-[0.3em] text-white/90 sm:text-3xl">{siteConfig.tagline}</p>
          <p className="mt-6 max-w-md text-balance text-white/85">
            Sole, palme e affari sporchi. Crea il tuo personaggio e vivi la tua storia a Miami.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/registrati"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 rounded-full px-8 text-base shadow-[0_8px_30px_rgb(255_121_176/0.45)]",
              )}
            >
              Registrati
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 rounded-full border-white/40 bg-white/10 px-8 text-base text-white backdrop-blur hover:bg-white/20",
              )}
            >
              Accedi
            </Link>
          </div>
          {/* Compare solo dopo la registrazione (?registrato=1) */}
          <Suspense>
            <RegisteredBanner />
          </Suspense>
        </div>

        <a href="#scopri" className="relative mx-auto mb-6 text-white/80 hover:text-white" aria-label="Scopri di più">
          <ChevronDown className="size-8 animate-bounce" />
        </a>
      </section>

      {/* Funzioni */}
      <section id="scopri" className="relative bg-[linear-gradient(to_bottom,#3f3285,#221a4d_40%,#1a1336)] px-5 py-20 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center font-heading text-4xl tracking-wide text-sunset sm:text-5xl">Benvenuto sulla costa</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            Tutto quello che serve per giocare, da computer o dal telefono.
          </p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="glass rounded-2xl p-5">
                <span className="mb-4 grid size-11 place-items-center rounded-xl bg-gradient-to-br from-flamingo to-peach">
                  <Icon className="size-5 text-primary-foreground" />
                </span>
                <h3 className="font-heading text-2xl tracking-wide">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-night px-5 py-8 text-center text-xs text-muted-foreground">
        {siteConfig.name} · Un gioco di ruolo amatoriale ambientato in una Miami immaginaria.
      </footer>
    </div>
  );
}
