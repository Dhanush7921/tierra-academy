import { asUser } from "@/lib/db/client";
import { apiUser, apiError } from "@/lib/api";
import { renderCertificatePdf } from "@/lib/services/certificate-pdf";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await apiUser();
  if (!user) return apiError(401, "Sign in required.");
  const [c] = await asUser(user, (tx) => tx`select * from public.certificates where id = ${id}`).catch(() => []); // RLS: owner or Super Admin
  if (!c) return apiError(404, "Certificate not found.");
  const pdf = await renderCertificatePdf(c as never);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="tierra-academy-${c.verification_code}.pdf"`, "Cache-Control": "private, no-store" } });
}
