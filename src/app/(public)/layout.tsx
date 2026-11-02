import { SiteHeader } from "@/components/public/SiteHeader";
import { SiteFooter } from "@/components/public/SiteFooter";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/rbac";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  return (
    <>
      <SiteHeader user={user ? { name: user.fullName, isStaff: can(user.roles, "admin.access") } : null} />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
