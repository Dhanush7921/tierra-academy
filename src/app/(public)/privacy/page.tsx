import type { Metadata } from "next";
import { DraftNotice, ProsePage } from "@/components/public/Prose";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <ProsePage eyebrow="Policies" title="Privacy policy" updated="November 2026">
      <DraftNotice />
      <h2>What we collect</h2>
      <ul><li>Account details: name, email, optional phone and city.</li><li>Learning activity: enrollments, lesson progress, quiz attempts, submissions, attendance.</li><li>Payment records: order and payment status from our payment partner (never full card details).</li><li>Technical data needed for security, such as IP address in audit and rate-limit logs.</li></ul>
      <h2>How we use it</h2>
      <p>To provide courses and live classes, track progress, issue certificates, process payments and refunds, send service notifications and keep the platform secure.</p>
      <h2>Live class recordings</h2>
      <p>Some live sessions are recorded and made available only to enrolled students. A recording notice is shown before you join. You may keep your camera and microphone off.</p>
      <h2>Certificate verification</h2>
      <p>The public verification page shows only your first name, last initial, course title and issue date.</p>
      <h2>Sharing</h2>
      <p>We share data only with service providers that run the platform (hosting, database, video streaming, video conferencing, payments, email), under their data-protection terms.</p>
      <h2>Your choices</h2>
      <p>You can update your profile and notification preferences, export your data, or request account deletion from My Lab → Profile. Some records (e.g. payment records) may be retained where the law requires.</p>
      <h2>Contact</h2>
      <p><a href="mailto:academy@tierraautomation.in">academy@tierraautomation.in</a></p>
    </ProsePage>
  );
}
