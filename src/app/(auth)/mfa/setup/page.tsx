import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Alert } from "@/components/ui/primitives";
import { AuthCard } from "../../AuthCard";
import { MfaSetup } from "../../AuthForms";

export const metadata: Metadata = { title: "Set up two-factor authentication" };

export default async function MfaSetupPage({ searchParams }: { searchParams: Promise<{ required?: string; welcome?: string }> }) {
  const sp = await searchParams;
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <AuthCard title="Protect your account" subtitle="Add a time-based one-time code (TOTP) to your sign-in.">
      {sp.required && <div className="mb-4"><Alert tone="warn">Two-factor authentication is required for administrator accounts.</Alert></div>}
      {sp.welcome && <div className="mb-4"><Alert tone="ok">Super Admin account created. Enable two-factor authentication now (strongly recommended).</Alert></div>}
      <MfaSetup email={user.email} />
    </AuthCard>
  );
}
