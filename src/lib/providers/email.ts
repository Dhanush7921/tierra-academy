import { asService } from "@/lib/db/client";
import { env } from "@/lib/env";

/**
 * Every email is written to public.email_outbox first (audit trail + dev inbox).
 *   EMAIL_PROVIDER=outbox → stays in the outbox (status DEV_OUTBOX), viewable at /admin/outbox
 *   EMAIL_PROVIDER=resend → delivered through the Resend HTTP API
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  template?: string;
}

const wrap = (inner: string) => `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#0b1220">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<div style="font-weight:800;letter-spacing:.08em;color:#e86a00;margin-bottom:16px">TIERRA ACADEMY</div>
<div style="background:#fff;border-radius:16px;padding:24px;line-height:1.55">${inner}</div>
<p style="font-size:12px;color:#667;margin-top:16px">Tierra Academy · a product of Tierra Automation · Visakhapatnam, India</p>
</div></body></html>`;

const toText = (html: string) => html.replace(/<br\s*\/?>/g, "\n").replace(/<\/p>/g, "\n\n").replace(/<[^>]+>/g, "").trim();

export async function sendEmail(msg: EmailMessage): Promise<{ id: string; status: string }> {
  const html = wrap(msg.html);
  const text = msg.text ?? toText(msg.html);
  const [row] = await asService(
    (tx) => tx`insert into public.email_outbox (to_email, subject, html, text_body, template)
               values (${msg.to}, ${msg.subject}, ${html}, ${text}, ${msg.template ?? null}) returning id`,
  );
  const id = row.id as string;
  const e = env();
  if (e.EMAIL_PROVIDER !== "resend" || !e.RESEND_API_KEY) {
    await asService((tx) => tx`update public.email_outbox set status = 'DEV_OUTBOX' where id = ${id}`);
    return { id, status: "DEV_OUTBOX" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to: [msg.to], subject: msg.subject, html, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Resend HTTP ${res.status}`);
    await asService((tx) => tx`update public.email_outbox set status = 'SENT', provider_message_id = ${data.id ?? null}, sent_at = now() where id = ${id}`);
    return { id, status: "SENT" };
  } catch (err) {
    await asService((tx) => tx`update public.email_outbox set status = 'FAILED', error = ${String(err).slice(0, 500)} where id = ${id}`);
    return { id, status: "FAILED" };
  }
}
