import { Logo } from "@/components/brand/logo";
import { SunsetScene } from "@/components/scenery/sunset-sky";

type AuthCardProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
};

/** Pannello centrale delle pagine di accesso, sopra la scena del tramonto. */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 items-center justify-center px-4 py-10">
      <SunsetScene className="-z-10" />
      <div className="glass w-full max-w-sm rounded-3xl bg-night/55 p-6 shadow-2xl sm:p-8">
        <div className="mb-6 text-center">
          <Logo size="sm" className="items-center" />
          <h1 className="mt-6 font-heading text-3xl tracking-wide">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
        <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
      </div>
    </main>
  );
}
