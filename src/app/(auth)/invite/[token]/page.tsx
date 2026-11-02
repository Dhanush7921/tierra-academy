import type { Metadata } from "next";
import Link from "next/link";
import { lookupInvitation } from "@/lib/services/invitations";
import { getSession } from "@/lib/auth/session";
import { acceptInviteAction } from "@/app/actions/auth";
import { Alert, buttonClass } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatDate, formatDateTime } from "@/lib/format";
import { AuthCard } from "../../AuthCard";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const [found, user] = await Promise.all([lookupInvitation(token), getSession()]);
  if (!found.valid) return <AuthCard title="Invitation unavailable"><Alert tone="warn">{found.reason}</Alert><Link href="/courses" className={buttonClass("outline", "sm", "mt-4")}>Browse courses</Link></AuthCard>;
  const inv = found.invitation;
  const accept = acceptInviteAction.bind(null, token);
  return (
    <AuthCard title="You're invited" subtitle={inv.course_title ? <>to <b>{inv.course_title as string}</b></> : <>to <b>{inv.session_title as string}</b> ({formatDateTime(inv.session_starts_at as string)})</>}>
      {error && <div className="mb-4"><Alert tone="danger">{error}</Alert></div>}
      <ul className="mb-5 space-y-1.5 text-sm text-fg-2">
        {inv.grants_complimentary ? <li>✓ Includes complimentary access</li> : inv.is_free ? <li>✓ Free course</li> : <li>This is a paid course — you&apos;ll complete checkout after accepting.</li>}
        <li>Expires {formatDate(inv.expires_at as string)}</li>
        {inv.email && <li>Reserved for {String(inv.email).replace(/(.{2}).+(@.+)/, "$1•••$2")}</li>}
      </ul>
      {user ? (
        <form action={accept}><SubmitButton size="lg" className="w-full" pendingText="Accepting…">Accept invitation</SubmitButton></form>
      ) : (
        <div className="grid gap-2">
          <Link href={`/register?next=/invite/${token}`} className={buttonClass("primary", "lg")}>Create account to accept</Link>
          <Link href={`/login?next=/invite/${token}`} className={buttonClass("outline", "lg")}>I already have an account</Link>
        </div>
      )}
    </AuthCard>
  );
}
