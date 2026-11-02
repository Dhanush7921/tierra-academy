import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/public/Prose";
import { LogoMark } from "@/components/ui/brand";
import { buttonClass } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "About the academy" };

export default function AboutPage() {
  return (
    <ProsePage eyebrow="The academy" title="Tierra Academy — Learn. Build. Automate.">
      <div className="flex items-center gap-4"><LogoMark size={64} /><p className="m-0">Tierra Academy is the learning platform of <a href="https://tierraautomation.in/" rel="noopener">Tierra Automation</a>, an engineering and technology company based in Visakhapatnam, India.</p></div>
      <h2>What we teach</h2>
      <p>Practical, project-first courses in six disciplines: Electronics, Robotics, the Internet of Things, Embedded Systems, Electrical Engineering and Mechanical Engineering. Every course is designed around building real things — circuits, firmware, connected devices, mechanisms and automated systems.</p>
      <h2>How you learn</h2>
      <ul>
        <li><b>Live classes</b> — scheduled, instructor-led sessions with attendance and recordings for enrolled students.</li>
        <li><b>Recorded courses</b> — secure streaming lessons you can resume on any device.</li>
        <li><b>Hybrid courses</b> — recorded fundamentals plus live build sessions.</li>
        <li><b>Assessments</b> — quizzes and assignments, with verifiable certificates when you complete the requirements.</li>
      </ul>
      <h2>A note on this preview</h2>
      <p>This is a demonstration build prepared for review. Courses, instructors and sessions shown are clearly labelled placeholder content; no statistics, testimonials or accreditations are claimed.</p>
      <p><Link href="/courses" className={buttonClass("primary", "md")} style={{ textDecoration: "none" }}>Explore courses</Link></p>
    </ProsePage>
  );
}
