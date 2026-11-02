import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import { logoutAction } from "@/app/actions/auth";
import { AppShell, type NavItem } from "@/components/ui/AppShell";
import { Icon } from "@/components/ui/Icon";
import { can } from "@/lib/rbac";
import { buttonClass } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ unread }] = await asUser(user, (tx) => tx`select count(*)::int as unread from public.notifications where read_at is null`);
  const nav: NavItem[] = [
    { href: "/dashboard", label: "My lab", icon: "grid" },
    { href: "/dashboard/courses", label: "My courses", icon: "book" },
    { href: "/dashboard/live", label: "Live classes", icon: "video" },
    { href: "/dashboard/assignments", label: "Assignments", icon: "inbox" },
    { href: "/dashboard/resources", label: "Resources", icon: "file" },
    { href: "/dashboard/certificates", label: "Certificates", icon: "award" },
    { href: "/dashboard/payments", label: "Payments", icon: "wallet" },
    { href: "/dashboard/notifications", label: "Notifications", icon: "bell", badge: unread as number },
    { href: "/dashboard/profile", label: "Profile & privacy", icon: "user" },
  ];
  return (
    <AppShell nav={nav} user={{ name: user.fullName, email: user.email }} roleLabel="Student" logout={logoutAction} home="/dashboard"
      topRight={
        <>
          <Link href="/courses" className={buttonClass("ghost", "sm", "max-sm:hidden")}><Icon name="search" size={16} />Browse courses</Link>
          {can(user.roles, "admin.access") && <Link href="/admin" className={buttonClass("outline", "sm")}>Admin panel</Link>}
          <Link href="/dashboard/notifications" className="relative grid size-10 place-items-center rounded-xl hover:bg-surface-2" aria-label={`Notifications (${unread} unread)`}>
            <Icon name="bell" />{(unread as number) > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-brand" />}
          </Link>
        </>
      }>
      {children}
    </AppShell>
  );
}
