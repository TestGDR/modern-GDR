import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Accedi" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Bentornato"
      subtitle="Accedi per tornare in gioco."
      footer={
        <>
          Non hai un account?{" "}
          <Link href="/registrati" className="font-medium text-flamingo hover:underline">
            Registrati
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
