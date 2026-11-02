import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getJoinInfo } from "@/lib/services/live";
import { Alert, Card, buttonClass } from "@/components/ui/primitives";
import { Classroom } from "@/components/student/Classroom";

export const metadata: Metadata = { title: "Live classroom" };

export default async function LiveRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const info = await getJoinInfo(user, id);
  if (!info.ok) return <div className="mx-auto max-w-xl py-10"><Alert tone="warn" title="Classroom unavailable">{info.error}</Alert><Link href="/dashboard/live" className={buttonClass("outline", "sm", "mt-4")}>Back to schedule</Link></div>;
  return (
    <div className="mx-auto max-w-7xl">
      {info.session.recordingNotice ? <div className="mb-4"><Alert tone="info" title="Recording notice">This class may be recorded and shared with enrolled students. You can keep your camera and microphone off.</Alert></div> : null}
      {info.mode === "demo" ? (
        <Classroom mode="demo" sessionId={id} session={info.session as never} user={{ id: user.id, name: user.fullName }} isHost={info.isHost} />
      ) : (
        <Classroom mode="zoom" sessionId={id} session={info.session as never} user={{ id: user.id, name: user.fullName }} isHost={info.isHost} zoom={info.sdk} joinUrl={info.joinUrl} />
      )}
      <Card className="mt-4 p-4 text-sm text-muted">Trouble joining? {info.mode === "zoom" ? <a className="text-brand-strong underline" href={info.joinUrl} target="_blank" rel="noopener noreferrer">Open in the Zoom app instead</a> : "Demo classrooms run entirely in your browser."}</Card>
    </div>
  );
}
