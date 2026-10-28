import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Registrati" };

export default function RegistratiPage() {
  return (
    <AuthCard
      title="Benvenuto a Miami"
      subtitle="Crea il tuo account, poi il tuo personaggio."
      footer={
        <>
          Hai già un account?{" "}
          <Link href="/login" className="font-medium text-flamingo hover:underline">
            Accedi
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
