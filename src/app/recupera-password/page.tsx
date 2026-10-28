import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordResetForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Recupera password" };

export default function RecuperaPasswordPage() {
  return (
    <AuthCard
      title="Password dimenticata"
      subtitle="Ti mandiamo un link per sceglierne una nuova."
      footer={
        <Link href="/login" className="font-medium text-flamingo hover:underline">
          Torna all&apos;accesso
        </Link>
      }
    >
      <PasswordResetForm />
    </AuthCard>
  );
}
