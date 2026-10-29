import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Account sospeso" };

export default function SospesoPage({ searchParams }: PageProps<"/sospeso">) {
  return (
    <AuthCard title="Account sospeso" subtitle="Lo staff ha sospeso questo account." footer={<>Per informazioni scrivi allo staff.</>}>
      <Suspense>
        <Details searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function Details({ searchParams }: { searchParams: PageProps<"/sospeso">["searchParams"] }) {
  const { fino, motivo } = await searchParams;
  const until =
    typeof fino !== "string"
      ? null
      : fino === "infinity"
        ? "a tempo indeterminato"
        : `fino al ${new Date(fino).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "long", timeStyle: "short" })}`;
  return (
    <div className="flex flex-col gap-2 text-center text-sm">
      {until && <p>La sospensione dura {until}.</p>}
      {typeof motivo === "string" && motivo && <p className="text-muted-foreground">Motivo: {motivo}</p>}
    </div>
  );
}
