import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthCard } from "../AuthCard";
import { RegisterForm } from "../AuthForms";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSession()) redirect("/dashboard");
  return (
    <AuthCard title="Create your student account" subtitle="Free to join. Enroll in free courses instantly." footer={<>Already have an account? <Link className="font-semibold text-brand-strong" href="/login">Sign in</Link></>}>
      <RegisterForm next={next} />
    </AuthCard>
  );
}
