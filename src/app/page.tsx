import { Suspense } from "react";
import { RegisteredBanner } from "@/components/auth/auth-forms";
import { AuthModalProvider, OpenAuthButton } from "@/components/auth/auth-modal";
import { Logo } from "@/components/brand/logo";
import { WindowButton } from "@/components/game/info-window";
import { GuideButton } from "@/components/guide/guide-app";
import { SunsetScene } from "@/components/scenery/sunset-sky";
import { buttonVariants } from "@/components/ui/button";
import { credits, disclaimer, siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

// Link sopra il logo: Guida, Credits, Disclaimer
const topLink = "font-heading text-lg tracking-[0.3em] text-sand/90 uppercase transition-colors hover:text-white sm:text-xl";

export default function Home() {
  return (
    <AuthModalProvider>
      <div className="flex flex-1 flex-col">
        {/* Hero a tutto schermo */}
        <section className="relative isolate flex flex-1 flex-col overflow-hidden">
          <SunsetScene className="-z-10" />

          <div className="flex flex-1 flex-col items-center px-5 pt-[max(12vh,env(safe-area-inset-top))] pb-16 text-center sm:pt-[14vh]">
            <nav className="mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1" aria-label="Informazioni">
              <GuideButton canEdit={false} className={topLink}>
                Guida
              </GuideButton>
              <span className="text-sand/50" aria-hidden>
                ·
              </span>
              <WindowButton label="Credits" icon={null} className={topLink} width={520}>
                <InfoText paragraphs={credits} />
              </WindowButton>
              <span className="text-sand/50" aria-hidden>
                ·
              </span>
              <WindowButton label="Disclaimer" icon={null} className={topLink} width={560}>
                <InfoText paragraphs={disclaimer} />
              </WindowButton>
            </nav>
            <h1>
              <Logo href={null} size="lg" priority />
            </h1>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <OpenAuthButton
                mode="signup"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 rounded-full px-8 text-base shadow-[0_8px_30px_rgb(255_121_176/0.45)]",
                )}
              >
                Registrati
              </OpenAuthButton>
              <OpenAuthButton
                mode="login"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-12 rounded-full border-white/40 bg-white/10 px-8 text-base text-white backdrop-blur hover:bg-white/20",
                )}
              >
                Accedi
              </OpenAuthButton>
            </div>
            {/* Compare dopo la registrazione dalla pagina /registrati (?registrato=1) */}
            <Suspense>
              <RegisteredBanner />
            </Suspense>
          </div>
        </section>

        <footer className="border-t border-border bg-night px-5 py-4 text-center text-xs text-muted-foreground">
          {siteConfig.name} · Un gioco di ruolo amatoriale ambientato in una Miami immaginaria.
        </footer>
      </div>
    </AuthModalProvider>
  );
}

function InfoText({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="flex flex-col gap-3 text-left text-sm leading-relaxed text-foreground/90">
      {paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}
