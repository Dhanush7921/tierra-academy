"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { asService } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";
import { contactSchema, zodErrors, type FormState } from "@/lib/validation";
import { enrollFree } from "@/lib/services/enrollment";
import { createCheckout } from "@/lib/services/payments";
import { notifySuperAdmins } from "@/lib/services/notifications";

export async function enrollFreeAction(courseId: string, slug: string) {
  const user = await getSession();
  if (!user) redirect(`/login?next=/courses/${slug}`);
  const r = await enrollFree(user, courseId);
  if (!r.ok) {
    if (r.needsPayment) redirect(`/checkout/${slug}`);
    redirect(`/courses/${slug}?error=${encodeURIComponent(r.error)}`);
  }
  redirect(`/dashboard/courses?enrolled=${slug}`);
}

export type CheckoutState = Awaited<ReturnType<typeof createCheckout>> | { ok: false; error: string } | undefined;

export async function startCheckoutAction(_prev: CheckoutState, fd: FormData): Promise<CheckoutState> {
  const user = await getSession();
  if (!user) return { ok: false, error: "Please sign in again." };
  const rl = await rateLimit(`checkout:${user.id}`, ...LIMITS.checkout);
  if (!rl.ok) return { ok: false, error: "Too many checkout attempts. Please wait a few minutes." };
  const courseId = String(fd.get("courseId") || "");
  const coupon = String(fd.get("coupon") || "").trim() || null;
  const optionId = String(fd.get("optionId") || "") || null;
  return createCheckout(user, courseId, coupon, optionId);
}

export async function contactAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ip = clientIp(await headers());
  const rl = await rateLimit(`contact:${ip}`, ...LIMITS.contact);
  if (!rl.ok) return { ok: false, message: "Too many messages from your network. Please try later." };
  const parsed = contactSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  if (parsed.data.website) return { ok: true, message: "Thanks!" }; // bot
  await asService((tx) => tx`insert into public.contact_messages (name, email, topic, message) values (${parsed.data.name}, ${parsed.data.email}, ${parsed.data.topic}, ${parsed.data.message})`);
  await notifySuperAdmins({ kind: "INFO", title: `New contact message (${parsed.data.topic})`, body: parsed.data.name, link: "/admin/settings#contact" });
  return { ok: true, message: "Thanks — your message has reached the academy team. We'll reply by email." };
}
