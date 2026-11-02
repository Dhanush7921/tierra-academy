import Link from "next/link";
import { Logo } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/client";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <div className="absolute inset-0 -z-10 bg-blueprint opacity-50 [mask-image:radial-gradient(60%_60%_at_50%_30%,#000,transparent)]" />
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6"><Logo /><ThemeToggle /></header>
      <main id="main" className="mx-auto flex max-w-md flex-col px-4 pb-16 pt-6">{children}</main>
      <p className="pb-8 text-center text-xs text-muted"><Link href="/privacy" className="hover:text-fg">Privacy</Link> · <Link href="/terms" className="hover:text-fg">Terms</Link></p>
    </div>
  );
}
