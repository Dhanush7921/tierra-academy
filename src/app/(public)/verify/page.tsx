import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Input, PageHeader, buttonClass } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Verify a certificate" };

async function go(fd: FormData) {
  "use server";
  const code = String(fd.get("code") || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  redirect(code ? `/verify/${code}` : "/verify");
}

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <PageHeader eyebrow="Certificates" title="Verify a certificate" description="Enter the verification ID printed on a Tierra Academy certificate (format TA-XXXX-XXXX-XXXX)." />
      <Card strong className="p-6">
        <form action={go} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="code" className="sr-only">Verification ID</label>
          <Input id="code" name="code" placeholder="TA-XXXX-XXXX-XXXX" required pattern="[Tt][Aa]-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}" className="font-mono uppercase" />
          <button className={buttonClass("primary", "md")} type="submit">Verify</button>
        </form>
      </Card>
    </div>
  );
}
