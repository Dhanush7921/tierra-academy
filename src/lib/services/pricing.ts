/** Pure pricing logic — unit tested. All amounts in paise. */
export interface PricedCourse {
  id: string;
  is_free: boolean;
  price_paise: number;
}

export interface CouponRow {
  id: string;
  code: string;
  kind: "PERCENT" | "FLAT";
  value: number;
  course_id: string | null;
  max_redemptions: number | null;
  redeemed_count: number;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  is_active: boolean;
}

export type PriceQuote =
  | { ok: true; subtotal: number; discount: number; total: number; couponId: string | null }
  | { ok: false; error: string };

export function couponError(c: CouponRow, courseId: string, now = new Date()): string | null {
  if (!c.is_active) return "This coupon is no longer active.";
  if (c.course_id && c.course_id !== courseId) return "This coupon is not valid for this course.";
  if (c.valid_from && new Date(c.valid_from) > now) return "This coupon is not active yet.";
  if (c.valid_until && new Date(c.valid_until) < now) return "This coupon has expired.";
  if (c.max_redemptions != null && c.redeemed_count >= c.max_redemptions) return "This coupon has been fully redeemed.";
  return null;
}

export function quote(course: PricedCourse, coupon: CouponRow | null, now = new Date()): PriceQuote {
  const subtotal = course.is_free ? 0 : course.price_paise;
  if (!coupon) return { ok: true, subtotal, discount: 0, total: subtotal, couponId: null };
  if (subtotal === 0) return { ok: false, error: "Coupons cannot be applied to free courses." };
  const err = couponError(coupon, course.id, now);
  if (err) return { ok: false, error: err };
  const raw = coupon.kind === "PERCENT" ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  const discount = Math.min(subtotal, Math.max(0, raw));
  let total = subtotal - discount;
  // Razorpay's minimum charge is ₹1 (100 paise): a tiny non-zero remainder is rounded up to ₹1.
  if (total > 0 && total < 100) total = Math.min(100, subtotal);
  return { ok: true, subtotal, discount: subtotal - total, total, couponId: coupon.id };
}

/** Tax is charged on the post-discount amount. rateBp = basis points (1800 = 18%). */
export function applyTax(q: Extract<PriceQuote, { ok: true }>, rateBp: number) {
  const net = q.total;
  const tax = net > 0 && rateBp > 0 ? Math.round((net * rateBp) / 10000) : 0;
  return { ...q, net, tax, payable: net + tax };
}
