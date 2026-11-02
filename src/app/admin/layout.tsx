import { requireStaff } from "@/lib/auth/session";
import { asService } from "@/lib/db/client";
import { logoutAction } from "@/app/actions/auth";
import { AppShell } from "@/components/ui/AppShell";
import { ADMIN_NAV, can } from "@/lib/rbac";
import { Badge, buttonClass } from "@/components/ui/primitives";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const sa = user.roles.includes("SUPER_ADMIN");
  const [counts] = await asService((tx) => tx`
    select (select count(*) from public.approval_requests where status = 'PENDING')::int as approvals,
           (select count(*) from public.refunds where status = 'REQUESTED')::int as refunds`);
  const nav = ADMIN_NAV.filter((n) => can(user.roles, n.permission)).map((n) => ({
    href: n.href, label: n.label, icon: n.icon,
    badge: sa && n.href === "/admin/approvals" ? (counts.approvals as number) : sa && n.href === "/admin/orders" ? (counts.refunds as number) : undefined,
  }));
  return (
    <AppShell nav={nav} user={{ name: user.fullName, email: user.email }} roleLabel={sa ? "Super Admin" : "Content Manager"} logout={logoutAction} home="/admin"
      topRight={<>{!user.hasMfa && <Link href="/mfa/setup" className="hidden sm:block"><Badge tone="warn">2FA not enabled</Badge></Link>}<Link href="/dashboard" className={buttonClass("ghost", "sm")}>Student view</Link></>}>
      {children}
    </AppShell>
  );
}
