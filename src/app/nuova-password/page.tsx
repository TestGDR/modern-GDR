import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { NewPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Nuova password" };

// Si arriva qui dal link dell'email di recupero (che apre già la sessione)
export default function NuovaPasswordPage() {
  return (
    <AuthCard title="Nuova password" subtitle="Scegli la password che userai per accedere." footer={null}>
      <NewPasswordForm />
    </AuthCard>
  );
}
