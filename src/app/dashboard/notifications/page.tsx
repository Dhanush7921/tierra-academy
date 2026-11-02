import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { myNotifications } from "@/lib/services/student";
import { markAllReadAction } from "@/app/actions/student";
import { Pagination, pageParam } from "@/components/ui/data";
import { Badge, Card, EmptyState, PageHeader, cx } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const page = pageParam(sp.page);
  const { rows, pages } = await myNotifications(user, page);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Inbox" title="Notifications" actions={<form action={markAllReadAction}><SubmitButton variant="outline" size="sm">Mark all as read</SubmitButton></form>} />
      {rows.length ? (
        <Card className="divide-y divide-line">
          {rows.map((n) => (
            <div key={n.id as string} className={cx("flex gap-3 p-4", !n.read_at && "bg-[color-mix(in_srgb,var(--brand)_6%,transparent)]")}>
              <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand")} aria-label={n.read_at ? undefined : "Unread"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><p className="font-semibold">{n.title as string}</p><Badge>{String(n.kind).toLowerCase()}</Badge></div>
                {n.body && <p className="text-sm text-fg-2">{n.body as string}</p>}
                <p className="mt-1 text-xs text-muted">{relativeTime(n.created_at as string)}{n.link ? <> · <Link href={n.link as string} className="text-brand-strong">Open</Link></> : null}</p>
              </div>
            </div>
          ))}
        </Card>
      ) : <EmptyState icon="bell" title="You're all caught up" />}
      <Pagination page={page} pages={pages} basePath="/dashboard/notifications" />
    </div>
  );
}
