import Link from "next/link";
import { Logo } from "@/components/ui/brand";
import { MotionToggle } from "@/components/ui/client";

const COLS = [
  { title: "Learn", links: [["/courses", "All courses"], ["/live", "Live classes"], ["/categories", "Disciplines"], ["/instructors", "Instructors"]] },
  { title: "Academy", links: [["/about", "About the academy"], ["/faq", "FAQ"], ["/contact", "Contact"], ["/verify", "Verify a certificate"]] },
  { title: "Policies", links: [["/terms", "Terms of use"], ["/privacy", "Privacy policy"], ["/refund-policy", "Refund policy"]] },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-muted">Tierra Academy is the learning platform of Tierra Automation, Visakhapatnam — hands-on engineering education for builders.</p>
          <a href="https://tierraautomation.in/" className="inline-block text-sm font-medium text-brand-strong hover:underline" rel="noopener">tierraautomation.in ↗</a>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <p className="label-mono mb-3">{c.title}</p>
            <ul className="space-y-2 text-sm">
              {c.links.map(([href, label]) => <li key={href}><Link href={href} className="text-fg-2 hover:text-brand-strong">{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Tierra Automation. Tierra Academy — Learn. Build. Automate.</p>
          <MotionToggle />
        </div>
      </div>
    </footer>
  );
}
