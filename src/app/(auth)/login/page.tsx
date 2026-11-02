import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/paths";
import { AuthCard } from "../AuthCard";
import { LoginForm } from "../AuthForms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSession()) redirect(safeNext(next));
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your Tierra Academy lab." footer={<>New here? <Link className="font-semibold text-brand-strong" href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link></>}>
      <LoginForm next={next} />
    </AuthCard>
  );
}
