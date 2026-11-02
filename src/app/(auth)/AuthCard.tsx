import type { ReactNode } from "react";
import { Card } from "@/components/ui/primitives";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      <Card strong className="mt-6 p-6">{children}</Card>
      {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
    </>
  );
}
