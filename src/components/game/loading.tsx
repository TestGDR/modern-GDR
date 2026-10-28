import { cn } from "@/lib/utils";

/** Segnaposto mentre i dati arrivano dal database */
export function LoadingBlocks({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4", className)} aria-busy="true" aria-label="Caricamento">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="glass h-24 animate-pulse rounded-2xl" />
      ))}
    </div>
  );
}

/** Messaggio per le liste vuote */
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl px-6 py-10 text-center">
      <p className="font-heading text-2xl tracking-wide">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
