import { asService, type Tx } from "@/lib/db/client";
import { sendEmail } from "@/lib/providers/email";
import { absoluteUrl } from "@/lib/paths";

export type NotificationKind = "INFO" | "ENROLLMENT" | "PAYMENT" | "LIVE" | "APPROVAL" | "CERTIFICATE" | "ASSIGNMENT" | "SYSTEM";

export async function notify(
  userId: string,
  n: { kind: NotificationKind; title: string; body?: string; link?: string; email?: boolean },
  tx?: Tx,
) {
  const insert = (t: Tx) =>
    t`insert into public.notifications (user_id, kind, title, body, link)
      values (${userId}, ${n.kind}, ${n.title}, ${n.body ?? ""}, ${n.link ?? null})`;
  if (tx) await insert(tx);
  else await asService(insert);
  if (n.email) {
    const [p] = await asService((t) => t`select email, notify_email from public.profiles where id = ${userId}`);
    if (p?.notify_email) {
      const link = n.link ? `<p><a href="${absoluteUrl(n.link)}">Open in Tierra Academy →</a></p>` : "";
      await sendEmail({ to: p.email as string, subject: n.title, html: `<p>${escapeHtml(n.body ?? "")}</p>${link}`, template: `notify:${n.kind}` });
    }
  }
}

export async function notifySuperAdmins(n: { kind: NotificationKind; title: string; body?: string; link?: string }) {
  const admins = await asService((t) => t`select user_id from public.user_roles where role = 'SUPER_ADMIN'`);
  for (const a of admins) await notify(a.user_id as string, n);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
