import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { asUser } from "@/lib/db/client";
import * as A from "../actions";
import { Flash, type SP } from "../Flash";
import { DataTable } from "@/components/ui/data";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/client";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Coupons · Admin" };

export default async function Coupons({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requirePermission("coupons.manage");
  const [rows, courses] = await asUser(user, async (tx) => [
    await tx`select k.*, c.title as course_title from public.coupons k left join public.courses c on c.id = k.course_id order by k.created_at desc`,
    await tx`select id, title from public.courses where not is_free order by title`,
  ]);
  return (
    <div className="mx-auto max-w-6xl">
      <Flash sp={sp} />
      <PageHeader eyebrow="Commerce" title="Coupons" description="Discounts are validated and applied on the server at checkout." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <DataTable rows={rows} rowKey={(r) => r.id as string} empty={{ title: "No coupons" }}
          columns={[
            { key: "c", header: "Code", cell: (r) => <span className="font-mono font-semibold">{r.code as string}</span> },
            { key: "v", header: "Discount", cell: (r) => r.kind === "PERCENT" ? `${r.value}%` : formatMoney(r.value as number) },
            { key: "s", header: "Scope", cell: (r) => <span className="text-sm">{(r.course_title as string) ?? "All paid courses"}</span> },
            { key: "u", header: "Used", cell: (r) => `${r.redeemed_count}${r.max_redemptions ? ` / ${r.max_redemptions}` : ""}` },
            { key: "e", header: "Expires", cell: (r) => r.valid_until ? formatDate(r.valid_until as string) : "—" },
            { key: "a", header: "", cell: (r) => <span className="flex items-center gap-2">{r.is_active ? <Badge tone="ok">active</Badge> : <Badge>inactive</Badge>}<form action={A.toggleCouponAction.bind(null, r.id as string, !r.is_active)}><SubmitButton size="sm" variant="ghost">{r.is_active ? "Deactivate" : "Activate"}</SubmitButton></form></span> },
          ]} />
        <Card className="h-fit p-5">
          <h2 className="mb-3 font-semibold">New coupon</h2>
          <form action={A.createCouponAction} className="grid gap-3">
            <Field label="Code" htmlFor="code"><Input id="code" name="code" required className="font-mono uppercase" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" htmlFor="kind"><Select id="kind" name="kind"><option value="PERCENT">Percent %</option><option value="FLAT">Flat ₹</option></Select></Field>
              <Field label="Value" htmlFor="value"><Input id="value" name="value" type="number" min="1" step="1" required /></Field>
            </div>
            <Field label="Course (optional)" htmlFor="courseId"><Select id="courseId" name="courseId"><option value="">All paid courses</option>{courses.map((c) => <option key={c.id as string} value={c.id as string}>{c.title as string}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max uses" htmlFor="maxRedemptions"><Input id="maxRedemptions" name="maxRedemptions" type="number" min="1" /></Field>
              <Field label="Valid until" htmlFor="validUntil"><Input id="validUntil" name="validUntil" type="date" /></Field>
            </div>
            <SubmitButton>Create coupon</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
