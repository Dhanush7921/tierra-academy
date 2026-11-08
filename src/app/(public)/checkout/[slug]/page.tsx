import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getCourseBySlug } from "@/lib/services/catalog";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { Alert, Card } from "@/components/ui/primitives";
import { CourseThumb } from "@/components/public/CourseCard";
import { CheckoutPanel } from "@/components/public/CheckoutPanel";
import { checkoutReadiness } from "@/lib/services/price-options";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { slug } = await params;
  const { invite } = await searchParams;
  const user = await requireUser();
  const d = await getCourseBySlug(slug, user);
  if (!d || d.course.status !== "PUBLISHED") notFound();
  const c = d.course;
  if (d.enrollment && ["ACTIVE", "COMPLETED"].includes(d.enrollment.status as string)) redirect(`/dashboard/learn/${slug}`);
  if (c.is_free) redirect(`/courses/${slug}`);
  const provider = env().PAYMENTS_PROVIDER;
  const readiness = await checkoutReadiness();
  const options = d.options.map((o) => ({ id: o.id as string, label: o.label as string, durationDays: o.duration_days as number | null, pricePaise: o.price_paise as number }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <Link href={`/courses/${slug}`} className="text-sm text-muted hover:text-fg">← Back to course</Link>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Checkout</h1>
      {invite && <div className="mt-4"><Alert tone="info">You were invited to this paid course. Complete checkout to unlock it.</Alert></div>}
      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1.1fr]">
        <Card className="p-4">
          <CourseThumb title={c.title as string} categorySlug={c.category_slug as string} accent={c.accent as string} src={c.thumbnail_url as string | null} />
          <h2 className="mt-4 font-display text-lg font-semibold">{c.title as string}</h2>
          <p className="mt-1 text-sm text-muted">{c.subtitle as string}</p>
          <p className="mt-4 font-display text-2xl font-semibold">{options.length > 1 ? "From " : ""}{formatMoney(c.price_paise as number, c.currency as string)} <span className="text-sm font-normal text-muted">+ {readiness.tax.label}</span></p>
        </Card>
        {readiness.ready
          ? <CheckoutPanel courseId={c.id as string} slug={slug} provider={provider} user={{ name: user.fullName, email: user.email }} options={options} tax={{ label: readiness.tax.label, rateBp: readiness.tax.rateBp }} />
          : <Card className="p-6"><h2 className="font-semibold">Enrollment opens soon</h2><p className="mt-2 text-sm text-muted">Online payment for this course is not available yet. <Link href="/contact" className="underline">Contact us</Link> and we'll let you know when it opens.</p></Card>}
      </div>
      <p className="mt-6 text-xs text-muted">Access unlocks only after the payment is verified on our server. By purchasing you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/refund-policy" className="underline">Refund Policy</Link>.</p>
    </div>
  );
}
