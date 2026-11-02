import type { Metadata } from "next";
import { DraftNotice, ProsePage } from "@/components/public/Prose";
import { REFUND_WINDOW_DAYS } from "@/lib/services/payments";

export const metadata: Metadata = { title: "Refund policy" };

export default function RefundPolicyPage() {
  return (
    <ProsePage eyebrow="Policies" title="Refund policy" updated="November 2026">
      <DraftNotice />
      <h2>Eligibility</h2>
      <p>You may request a refund for a paid course within <b>{REFUND_WINDOW_DAYS} days</b> of purchase from My Lab → Payments. Each request is reviewed by the academy team.</p>
      <h2>What happens next</h2>
      <ul><li>Approved refunds are returned to the original payment method through our payment partner. Banks typically take 5–7 working days to reflect the credit.</li><li>Course access, including recordings and certificates for that course, is removed once a full refund is processed.</li></ul>
      <h2>Not eligible</h2>
      <ul><li>Requests after the refund window, or after a certificate has been issued for the course.</li><li>Orders that were fully discounted with a coupon.</li></ul>
      <h2>Questions</h2>
      <p>Contact <a href="mailto:academy@tierraautomation.in">academy@tierraautomation.in</a> with your order receipt number.</p>
    </ProsePage>
  );
}
