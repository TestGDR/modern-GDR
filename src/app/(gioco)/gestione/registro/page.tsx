import type { Metadata } from "next";
import { Suspense } from "react";
import { BackToPanel } from "@/components/admin/admin-ui";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { ENTITY_LABELS } from "@/config/admin";
import { requirePermission } from "@/lib/admin";
import { getLog, type LogEntry } from "@/lib/admin-data";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Registro delle azioni" };

export default function Page() {
  return (
    <>
      <BackToPanel />
      <PageHeader title="Registro delle azioni" subtitle="Le ultime 150 modifiche fatte dal pannello." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

/** Campi cambiati in una modifica (confronto tra "prima" e "dopo") */
function changedFields(entry: LogEntry) {
  const d = entry.details as { prima?: Record<string, unknown>; dopo?: Record<string, unknown> } | null;
  if (!d?.prima || !d?.dopo) return [];
  return Object.keys(d.dopo).filter((k) => k !== "created_at" && JSON.stringify(d.prima?.[k]) !== JSON.stringify(d.dopo?.[k]));
}

async function Content() {
  await requirePermission("log.vedere");
  const log = await getLog();
  if (log.length === 0) {
    return <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">Nessuna azione registrata.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {log.map((e) => {
        const fields = changedFields(e);
        return (
          <li key={e.id} className="glass rounded-2xl px-4 py-3 text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{e.actor?.username ?? "SQL Editor / sistema"}</span>
              <span className="text-muted-foreground">{e.action}</span>
              <span>
                {ENTITY_LABELS[e.entity] ?? e.entity}: <strong className="text-peach">{e.entity_label ?? "—"}</strong>
              </span>
              <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(e.created_at)}</span>
            </p>
            {fields.length > 0 && <p className="text-xs text-muted-foreground">Campi cambiati: {fields.join(", ")}</p>}
          </li>
        );
      })}
    </ul>
  );
}
