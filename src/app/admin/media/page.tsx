import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { DataTable, Pagination, pageParam } from "@/components/ui/data";
import { PageHeader, StatusBadge } from "@/components/ui/primitives";
import { formatDateTime, formatDuration } from "@/lib/format";
import type { SP } from "../Flash";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Media · Admin" };

export default async function MediaPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const user = await requirePermission("media.upload");
  const rows = await asUser(user, (tx) => tx`
    select v.id, v.original_filename, v.provider, v.status, v.duration_seconds, v.size_bytes, v.created_at, c.id as course_id, c.title as course_title, count(*) over()::int as total
    from public.video_assets v left join public.courses c on c.id = v.course_id order by v.created_at desc limit 25 offset ${(page - 1) * 25}`);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Media" title="Video library" description={`Video provider: ${env().VIDEO_PROVIDER === "cloudflare" ? "Cloudflare Stream (signed playback)" : "LOCAL development storage + synthetic demo clips"}. Upload from a course's Media tab.`} />
      <DataTable rows={rows} rowKey={(r) => r.id as string} empty={{ title: "No videos uploaded" }}
        columns={[
          { key: "f", header: "File", cell: (r) => <span className="font-medium">{(r.original_filename as string) ?? r.id}</span> },
          { key: "c", header: "Course", cell: (r) => r.course_id ? <Link className="hover:text-brand-strong" href={`/admin/courses/${r.course_id}?tab=media`}>{r.course_title as string}</Link> : <span className="text-muted">Shared demo clip</span> },
          { key: "p", header: "Provider", cell: (r) => r.provider as string },
          { key: "d", header: "Duration", cell: (r) => formatDuration((r.duration_seconds as number) ?? 0) },
          { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status as string} /> },
          { key: "t", header: "Uploaded", cell: (r) => <span className="text-xs text-muted">{formatDateTime(r.created_at as string)}</span> },
        ]} />
      <Pagination page={page} pages={Math.max(1, Math.ceil(((rows[0]?.total as number) ?? 0) / 25))} basePath="/admin/media" />
    </div>
  );
}
