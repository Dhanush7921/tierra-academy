import type { Metadata } from "next";
import { DraftNotice, ProsePage } from "@/components/public/Prose";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <ProsePage eyebrow="Policies" title="Terms of use" updated="November 2026">
      <DraftNotice />
      <h2>1. About these terms</h2>
      <p>These terms govern your use of Tierra Academy, operated by Tierra Automation, Visakhapatnam, India. By creating an account or purchasing a course you agree to them.</p>
      <h2>2. Accounts</h2>
      <ul><li>You must provide accurate information and keep your password confidential.</li><li>Accounts are personal; sharing logins or course access is not permitted.</li><li>We may suspend accounts that misuse the platform or violate these terms.</li></ul>
      <h2>3. Courses and content</h2>
      <p>Course materials, recordings and documents are licensed to you for personal, non-commercial learning. Downloading, recording or redistributing protected content is prohibited.</p>
      <h2>4. Live classes</h2>
      <p>Live sessions may be recorded for enrolled students. Participate respectfully; disruptive behaviour may lead to removal from a session.</p>
      <h2>5. Payments</h2>
      <p>Prices are shown in INR and include applicable taxes unless stated otherwise. Payments are processed by our payment partner; we do not store card details.</p>
      <h2>6. Certificates</h2>
      <p>Certificates are issued when configured completion requirements are met and may be revoked if obtained dishonestly.</p>
      <h2>7. Liability</h2>
      <p>Hands-on projects involve electrical and mechanical work. Follow safety guidance and use appropriate equipment; you are responsible for safe practice.</p>
      <h2>8. Contact</h2>
      <p>Questions about these terms: <a href="mailto:academy@tierraautomation.in">academy@tierraautomation.in</a>.</p>
    </ProsePage>
  );
}
