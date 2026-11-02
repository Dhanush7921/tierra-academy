import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { myCertificates } from "@/lib/services/student";
import { Badge, Card, EmptyState, PageHeader, buttonClass } from "@/components/ui/primitives";
import { CopyButton } from "@/components/ui/client";
import { LogoMark } from "@/components/ui/brand";
import { formatDate } from "@/lib/format";
import { absoluteUrl, apiPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const user = await requireUser();
  const certs = await myCertificates(user);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Achievements" title="Certificates" description="Issued automatically when you complete a course's requirements. Each has a public verification ID." />
      {certs.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {certs.map((c) => (
            <Card key={c.id as string} strong className="relative overflow-hidden p-6">
              <div className="absolute -right-10 -top-10 size-40 rounded-full bg-brand/20 blur-3xl" />
              <div className="flex items-center gap-3"><LogoMark size={44} /><div><p className="label-mono">Certificate of completion</p><p className="font-display font-semibold">{c.course_title as string}</p></div></div>
              <p className="mt-4 text-sm text-muted">Awarded to <b className="text-fg">{c.recipient_name as string}</b> on {formatDate(c.issued_at as string)}</p>
              <p className="mt-1 font-mono text-sm">{c.verification_code as string} {c.revoked_at && <Badge tone="danger">Revoked</Badge>}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href={apiPath(`/certificates/${c.id}/pdf`)} className={buttonClass("primary", "sm")}>Download PDF</a>
                <Link href={`/verify/${c.verification_code}`} className={buttonClass("outline", "sm")}>Public page</Link>
                <CopyButton text={absoluteUrl(`/verify/${c.verification_code}`)} label="Copy verify link" />
              </div>
            </Card>
          ))}
        </div>
      ) : <EmptyState icon="award" title="No certificates yet" description="Complete all required lessons, quizzes and assignments in a course to earn one." action={<Link className={buttonClass("outline", "sm")} href="/dashboard/courses">Go to my courses</Link>} />}
    </div>
  );
}
