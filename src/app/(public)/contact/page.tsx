import type { Metadata } from "next";
import { ContactForm } from "@/components/public/ContactForm";
import { PageHeader, Card } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <PageHeader eyebrow="Contact" title="Talk to the academy team" description="Questions about courses, live classes, payments or partnerships — send us a message." />
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <Card strong className="p-6"><ContactForm /></Card>
        <div className="space-y-4">
          <Card className="p-5"><p className="label-mono mb-2">Email</p><a className="flex items-center gap-2 font-medium hover:text-brand-strong" href="mailto:academy@tierraautomation.in"><Icon name="mail" size={16} />academy@tierraautomation.in</a></Card>
          <Card className="p-5"><p className="label-mono mb-2">Company</p><p className="text-sm text-fg-2">Tierra Automation · Visakhapatnam, Andhra Pradesh, India</p><a className="mt-2 inline-block text-sm text-brand-strong underline" href="https://tierraautomation.in/" rel="noopener">tierraautomation.in</a></Card>
        </div>
      </div>
    </div>
  );
}
