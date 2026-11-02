import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { dataRequestAction } from "@/app/actions/student";
import { ProfileForms } from "@/components/student/ProfileForms";
import { Badge, Card, PageHeader, buttonClass } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { apiPath } from "@/lib/paths";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Profile & privacy" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [[p], reqs] = await Promise.all([
    asUser(user, (tx) => tx`select full_name, phone, city, bio, notify_email, notify_live_reminders from public.profiles where id = ${user.id}`),
    asUser(user, (tx) => tx`select kind, status, created_at from public.data_requests where user_id = ${user.id} order by created_at desc`),
  ]);
  const exportReq = dataRequestAction.bind(null, "EXPORT");
  const deleteReq = dataRequestAction.bind(null, "DELETE");
  const pending = (k: string) => reqs.some((r) => r.kind === k && r.status === "PENDING");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Account" title="Profile & privacy" />
      <ProfileForms profile={{ fullName: p.full_name as string, phone: (p.phone as string) ?? "", city: (p.city as string) ?? "", bio: (p.bio as string) ?? "", notifyEmail: p.notify_email as boolean, notifyLive: p.notify_live_reminders as boolean }} localAuth={env().AUTH_PROVIDER === "local"} />
      <Card className="p-6">
        <h2 className="font-semibold">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-muted">{user.hasMfa ? "Enabled — your account requires a one-time code at sign-in." : "Add an authenticator app for stronger account security."}</p>
        {user.hasMfa ? <Badge tone="ok" className="mt-3">Enabled</Badge> : <Link href="/mfa/setup" className={buttonClass("outline", "sm", "mt-3")}>Set up 2FA</Link>}
      </Card>
      <Card className="p-6">
        <h2 className="font-semibold">Your data</h2>
        <p className="mt-1 text-sm text-muted">Download a copy of your data instantly, or ask us to delete your account. Payment records may be retained where the law requires.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={apiPath("/me/export")} className={buttonClass("outline", "sm")}>Download my data (JSON)</a>
          <form action={exportReq}><SubmitButton variant="ghost" size="sm">{pending("EXPORT") ? "Export requested ✓" : "Request assisted export"}</SubmitButton></form>
          <form action={deleteReq}><SubmitButton variant="danger" size="sm">{pending("DELETE") ? "Deletion requested ✓" : "Request account deletion"}</SubmitButton></form>
        </div>
      </Card>
    </div>
  );
}
