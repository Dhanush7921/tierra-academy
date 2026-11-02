"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/brand";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/client";
import { buttonClass, cx } from "@/components/ui/primitives";

const NAV = [
  { href: "/courses", label: "Courses" },
  { href: "/live", label: "Live classes" },
  { href: "/categories", label: "Disciplines" },
  { href: "/about", label: "Academy" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ user }: { user: { name: string; isStaff: boolean } | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className={cx("sticky top-0 z-40 transition-all duration-300", scrolled ? "glass-strong border-x-0 border-t-0" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo textOnMobile={false} />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={pathname.startsWith(n.href) ? "page" : undefined}
              className={cx("rounded-lg px-3 py-2 text-sm font-medium transition", pathname.startsWith(n.href) ? "text-fg" : "text-muted hover:text-fg")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {user ? (
            <>
              {user.isStaff && <Link href="/admin" className={buttonClass("ghost", "sm", "max-sm:hidden")}>Admin</Link>}
              <Link href="/dashboard" className={buttonClass("primary", "sm")}>My lab</Link>
            </>
          ) : (
            <>
              <Link href="/login" className={buttonClass("ghost", "sm", "max-sm:hidden")}>Sign in</Link>
              <Link href="/register" className={buttonClass("primary", "sm")}>Start learning</Link>
            </>
          )}
          <button type="button" className="grid size-10 place-items-center rounded-xl hover:bg-surface-2 lg:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? "x" : "menu"} />
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="glass-strong mx-4 mb-3 rounded-2xl p-2 lg:hidden">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="block rounded-xl px-4 py-3 text-sm font-medium hover:bg-surface-2">{n.label}</Link>)}
          {!user && <Link href="/login" className="block rounded-xl px-4 py-3 text-sm font-medium hover:bg-surface-2">Sign in</Link>}
        </nav>
      )}
    </header>
  );
}
