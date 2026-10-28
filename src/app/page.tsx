import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = ["Chat di gioco", "Messaggi privati", "Mappe", "Forum", "Social"];

// Legge la sessione dai cookie: è dinamico, quindi sta dentro <Suspense>.
async function SupabaseStatus() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userEmail = data?.claims?.email as string | undefined;

  return (
    <>
      <p className="text-sm">
        Supabase:{" "}
        <span className={error ? "text-destructive" : "text-green-600"}>
          {error ? `errore (${error.message})` : "collegato"}
        </span>
      </p>
      <p className="text-sm text-muted-foreground">
        {userEmail ? `Accesso come ${userEmail}` : "Nessun utente collegato"}
      </p>
    </>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Modern GDR</CardTitle>
          <CardDescription>Il gioco di ruolo play by chat, in costruzione.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-wrap gap-2">
            {features.map((f) => (
              <li key={f} className="rounded-md bg-muted px-2 py-1 text-sm">
                {f}
              </li>
            ))}
          </ul>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Controllo Supabase…</p>}>
            <SupabaseStatus />
          </Suspense>
          <Button disabled>Entra nel gioco (presto)</Button>
        </CardContent>
      </Card>
    </main>
  );
}
