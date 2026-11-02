"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/brand";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/client";
import { Avatar, cx } from "@/components/ui/primitives";

export interface NavItem { href: string; label: string; icon: string; badge?: number }

/** Glass sidebar + top bar layout shared by the Student and Admin panels. */
export function AppShell({ nav, user, roleLabel, children, logout, topRight, home }: {
  nav: NavItem[]; user: { name: string; email: string }; roleLabel: string; children: ReactNode; logout: () => Promise<void>; topRight?: ReactNode; home: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const isActive = (href: string) => (href === home ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const sidebar = (
    <nav aria-label={`${roleLabel} navigation`} className="flex h-full flex-col">
      <div className="px-4 pb-4 pt-5"><Logo href={home} /></div>
      <p className="label-mono px-5 pb-2">{roleLabel}</p>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map((n) => (
          <li key={n.href}>
            <Link href={n.href} aria-current={isActive(n.href) ? "page" : undefined}
              className={cx("group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                isActive(n.href) ? "bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_22%,transparent),transparent)] text-fg shadow-[inset_2px_0_0_var(--brand)]" : "text-muted hover:bg-surface-2 hover:text-fg")}>
              <Icon name={n.icon} size={18} className={isActive(n.href) ? "text-brand" : ""} />
              <span className="flex-1">{n.label}</span>
              {n.badge ? <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-on-brand">{n.badge}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      <div className="m-3 rounded-2xl border border-line p-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} size={34} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.name}</p><p className="truncate text-xs text-muted">{user.email}</p></div>
        </div>
        <form action={logout} className="mt-3"><button className="flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg"><Icon name="logout" size={14} />Sign out</button></form>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="glass sticky top-0 hidden h-dvh w-64 shrink-0 border-y-0 border-l-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="glass-strong absolute inset-y-0 left-0 w-72">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6">
          <button className="grid size-10 place-items-center rounded-xl hover:bg-surface-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <div className="flex-1" />
          {topRight}
          <ThemeToggle />
        </header>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
