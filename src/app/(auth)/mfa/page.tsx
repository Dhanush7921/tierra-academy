import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { logoutAction } from "@/app/actions/auth";
import { AuthCard } from "../AuthCard";
import { MfaForm } from "../AuthForms";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.hasMfa || user.aal === 2) redirect(next || "/dashboard");
  return (
    <AuthCard title="Two-factor verification" subtitle="Enter the code from your authenticator app to continue." footer={<form action={logoutAction}><button className="underline">Sign out</button></form>}>
      <MfaForm next={next} />
    </AuthCard>
  );
}
