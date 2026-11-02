import type { Metadata } from "next";
import { ProsePage } from "@/components/public/Prose";

export const metadata: Metadata = { title: "FAQ" };

const FAQ: [string, string][] = [
  ["Do I need prior experience?", "Beginner courses assume no prior experience. Each course lists its requirements on the course page."],
  ["What is the difference between live and recorded courses?", "Recorded courses are streamed lessons you take at your own pace. Live courses are scheduled sessions with an instructor; enrolled students receive reminders and, where enabled, recordings. Hybrid courses combine both."],
  ["How do I join a live class?", "Enroll in the course, then open My Lab → Live Classes. The classroom opens 15 minutes before the start time. You can join in the browser or with the Zoom app."],
  ["Are live classes recorded?", "Some sessions are recorded for enrolled students. You will always see a recording notice before you join a recorded session."],
  ["How do payments work?", "Paid courses use a secure checkout. Access unlocks only after the payment is verified by our server. You can view every payment in My Lab → Payments."],
  ["Can I get a refund?", "Yes, within the window described in the Refund Policy. Request it from My Lab → Payments."],
  ["How do certificates work?", "When you complete a course's required lessons, quizzes and assignments, a certificate is issued automatically with a unique verification ID that anyone can check on the Verify page."],
  ["Can I watch on my phone?", "Yes. The academy works on phones, tablets and computers; your progress syncs automatically."],
];

export default function FaqPage() {
  return (
    <ProsePage eyebrow="Help" title="Frequently asked questions">
      <div className="space-y-3">
        {FAQ.map(([q, a]) => (
          <details key={q} className="glass group rounded-2xl px-5 py-4">
            <summary className="cursor-pointer list-none font-semibold text-fg">{q}</summary>
            <p className="mt-2">{a}</p>
          </details>
        ))}
      </div>
    </ProsePage>
  );
}
