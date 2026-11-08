import { revalidateTag } from "next/cache";
import { asService, asUser, type Tx } from "@/lib/db/client";
import { env } from "@/lib/env";
import { audit } from "@/lib/services/audit";

type Actor = { id: string; email: string; roles: string[] };
const requireSA = (a: Actor) => { if (!a.roles.includes("SUPER_ADMIN")) throw new Error("Only a Super Admin can change prices or taxes."); };
const touch = () => { try { revalidateTag("catalog"); } catch { /* outside a request */ } };

export interface PriceOption { id: string; course_id: string; label: string; duration_days: number | null; price_paise: number; is_active: boolean; sort_order: number }
export interface TaxSettings { label: string; rateBp: number; configured: boolean }
const NO_TAX: TaxSettings = { label: "Tax", rateBp: 0, configured: false };

export async function listOptions(tx: Tx, courseId: string, activeOnly = true): Promise<PriceOption[]> {
  return (await tx`select id, course_id, label, duration_days, price_paise, is_active, sort_order from public.course_price_options
    where course_id = ${courseId} ${activeOnly ? tx`and is_active` : tx``} order by sort_order, price_paise`) as unknown as PriceOption[];
}

export async function getTaxSettings(tx?: Tx): Promise<TaxSettings> {
  const read = async (t: Tx) => (await t`select value from public.platform_settings where key = 'tax'`)[0]?.value as TaxSettings | undefined;
  const v = tx ? await read(tx) : await asService(read);
  return v ? { ...NO_TAX, ...v } : NO_TAX;
}

/**
 * Real checkout is enabled only when the tax setup is confirmed and a real payment provider
 * is configured. Demo payments are allowed only outside production mode.
 */
export async function checkoutReadiness(tx?: Tx): Promise<{ ready: boolean; reason: string | null; tax: TaxSettings }> {
  const e = env();
  const tax = await getTaxSettings(tx);
  if (!tax.configured) return { ready: false, reason: "Tax setup has not been confirmed by the Super Admin.", tax };
  if (e.PAYMENTS_PROVIDER === "razorpay") {
    if (!e.RAZORPAY_KEY_ID || !e.RAZORPAY_KEY_SECRET || !e.RAZORPAY_WEBHOOK_SECRET) return { ready: false, reason: "Razorpay keys and webhook secret are not configured.", tax };
    return { ready: true, reason: null, tax };
  }
  if (e.APP_MODE === "production") return { ready: false, reason: "Payments are not connected yet.", tax };
  return { ready: true, reason: null, tax };
}

export async function saveOption(actor: Actor, courseId: string, o: { id?: string; label: string; durationDays: number | null; pricePaise: number; isActive: boolean; sortOrder: number }) {
  requireSA(actor);
  const row = await asUser(actor, async (tx) => {
    const [before] = o.id ? await tx`select label, duration_days, price_paise, is_active from public.course_price_options where id = ${o.id} and course_id = ${courseId}` : [null];
    const [r] = o.id
      ? await tx`update public.course_price_options set label = ${o.label}, duration_days = ${o.durationDays}, price_paise = ${o.pricePaise},
                   is_active = ${o.isActive}, sort_order = ${o.sortOrder} where id = ${o.id} and course_id = ${courseId} returning id`
      : await tx`insert into public.course_price_options (course_id, label, duration_days, price_paise, is_active, sort_order)
                 values (${courseId}, ${o.label}, ${o.durationDays}, ${o.pricePaise}, ${o.isActive}, ${o.sortOrder}) returning id`;
    if (!r) throw new Error("Price option not found.");
    await audit({ actorId: actor.id, actorRole: "SUPER_ADMIN", action: o.id ? "price.update" : "price.create", entityType: "course", entityId: courseId,
      metadata: { optionId: r.id, before: before ?? null, after: { label: o.label, durationDays: o.durationDays, pricePaise: o.pricePaise, isActive: o.isActive } } }, tx);
    return r;
  });
  touch();
  return row;
}

export async function deleteOption(actor: Actor, courseId: string, id: string) {
  requireSA(actor);
  await asUser(actor, async (tx) => {
    const [r] = await tx`delete from public.course_price_options where id = ${id} and course_id = ${courseId} returning label, price_paise`;
    if (!r) throw new Error("Price option not found.");
    await audit({ actorId: actor.id, actorRole: "SUPER_ADMIN", action: "price.delete", entityType: "course", entityId: courseId, metadata: { optionId: id, before: r } }, tx);
  });
  touch();
}

export async function saveTaxSettings(actor: Actor, t: TaxSettings) {
  requireSA(actor);
  if (!Number.isInteger(t.rateBp) || t.rateBp < 0 || t.rateBp > 10000) throw new Error("Tax rate must be between 0 and 100%.");
  await asUser(actor, async (tx) => {
    const before = await getTaxSettings(tx);
    await tx`insert into public.platform_settings (key, value, updated_by) values ('tax', ${tx.json(t as never)}, ${actor.id})
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
    await audit({ actorId: actor.id, actorRole: "SUPER_ADMIN", action: "tax.update", entityType: "settings", entityId: "tax", metadata: { before, after: t } }, tx);
  });
  touch();
}
