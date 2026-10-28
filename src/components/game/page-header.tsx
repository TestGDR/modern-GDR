import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
};

/** Titolo di pagina in stile poster. */
export function PageHeader({ title, subtitle, children, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        <h1 className="font-heading text-4xl tracking-wide text-sunset sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
