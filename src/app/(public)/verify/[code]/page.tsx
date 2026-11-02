import type { Metadata } from "next";
import Link from "next/link";
import { asUser } from "@/lib/db/client";
import { Card, buttonClass } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { LogoMark } from "@/components/ui/brand";
import { formatDate } from "@/lib/format";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const metadata: Metadata = { title: "Certificate verification", robots: { index: false } };

export default async function VerifyCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const rl = await rateLimit(`verify:${clientIp(await headers())}`, 60, 600);
  const rows = rl.ok && /^TA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code)
    ? await asUser(null, (tx) => tx`select * from public.verify_certificate(${code})`) : [];
  const c = rows[0];
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Card strong className="p-8 text-center">
        <div className="mx-auto mb-5 w-fit"><LogoMark size={64} /></div>
        {!rl.ok ? <p>Too many lookups. Please try again later.</p> : c ? (
          <>
            <div className={`mx-auto mb-4 grid size-14 place-items-center rounded-full ${c.is_revoked ? "bg-danger/15 text-danger" : "bg-ok/15 text-ok"}`}><Icon name={c.is_revoked ? "alert" : "check"} size={28} /></div>
            <h1 className="font-display text-2xl font-semibold">{c.is_revoked ? "Certificate revoked" : "Valid certificate"}</h1>
            <dl className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">Recipient</dt><dd className="font-semibold">{c.recipient_display as string}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Course</dt><dd className="text-right font-semibold">{c.course_title as string}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Issued</dt><dd>{formatDate(c.issued_at as string)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">ID</dt><dd className="font-mono">{c.verification_code as string}</dd></div>
            </dl>
            <p className="mt-6 text-xs text-muted">For privacy, only the recipient&apos;s first name and last initial are shown.</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold">No certificate found</h1>
            <p className="mt-2 text-muted">Check the ID and try again. IDs look like TA-XXXX-XXXX-XXXX.</p>
          </>
        )}
        <Link href="/verify" className={buttonClass("outline", "sm", "mt-6")}>Verify another</Link>
      </Card>
    </div>
  );
}
