import { describe, it, expect } from "vitest";
import { applyTax, quote, couponError, type CouponRow } from "@/lib/services/pricing";
import { eligibilityError } from "@/lib/services/enrollment";
import { gradeAnswers, isVideoComplete } from "@/lib/services/learning";
import { formatMoney, formatDuration, slugify } from "@/lib/format";

const course = { id: "c1", is_free: false, price_paise: 299900 };
const coupon = (o: Partial<CouponRow> = {}): CouponRow => ({ id: "k", code: "X", kind: "PERCENT", value: 10, course_id: null, max_redemptions: null, redeemed_count: 0, valid_from: null, valid_until: null, is_active: true, ...o });

describe("pricing & coupons", () => {
  it("applies percent and flat discounts server-side", () => {
    expect(quote(course, null)).toMatchObject({ ok: true, total: 299900 });
    expect(quote(course, coupon())).toMatchObject({ ok: true, discount: 29990, total: 269910 });
    expect(quote(course, coupon({ kind: "FLAT", value: 50000 }))).toMatchObject({ ok: true, total: 249900 });
    expect(quote(course, coupon({ kind: "PERCENT", value: 100 }))).toMatchObject({ ok: true, total: 0 });
  });
  it("never discounts below zero and rounds sub-₹1 remainders up to ₹1", () => {
    expect(quote(course, coupon({ kind: "FLAT", value: 999999 }))).toMatchObject({ ok: true, total: 0 });
    expect(quote(course, coupon({ kind: "FLAT", value: 299850 }))).toMatchObject({ ok: true, total: 100 });
  });
  it("rejects invalid coupons", () => {
    expect(couponError(coupon({ is_active: false }), "c1")).toMatch(/no longer active/);
    expect(couponError(coupon({ course_id: "other" }), "c1")).toMatch(/not valid/);
    expect(couponError(coupon({ valid_until: new Date(Date.now() - 1000) }), "c1")).toMatch(/expired/);
    expect(couponError(coupon({ max_redemptions: 1, redeemed_count: 1 }), "c1")).toMatch(/fully redeemed/);
    expect(quote({ id: "c1", is_free: true, price_paise: 0 }, coupon()).ok).toBe(false);
  });
});

describe("enrollment eligibility", () => {
  const base = { id: "c", status: "PUBLISHED", enrollment_open: true, enrollment_capacity: null, enrollment_starts_at: null, enrollment_ends_at: null };
  it("allows a published open course", () => expect(eligibilityError(base, 0)).toBeNull());
  it("blocks drafts, closed, full and out-of-window courses", () => {
    expect(eligibilityError({ ...base, status: "DRAFT" }, 0)).toBeTruthy();
    expect(eligibilityError({ ...base, enrollment_open: false }, 0)).toBeTruthy();
    expect(eligibilityError({ ...base, enrollment_capacity: 10 }, 10)).toMatch(/full/);
    expect(eligibilityError({ ...base, enrollment_starts_at: new Date(Date.now() + 86400000) }, 0)).toMatch(/not opened/);
    expect(eligibilityError({ ...base, enrollment_ends_at: new Date(Date.now() - 1000) }, 0)).toMatch(/ended/);
  });
});

describe("learning logic", () => {
  it("grades quizzes on the server", () => {
    const qs = [{ id: "a", correct_index: 1, points: 1 }, { id: "b", correct_index: 0, points: 2 }];
    expect(gradeAnswers(qs, { a: 1, b: 0 })).toEqual({ score: 3, max: 3, percent: 100 });
    expect(gradeAnswers(qs, { a: 0, b: 0 })).toEqual({ score: 2, max: 3, percent: 66.67 });
    expect(gradeAnswers(qs, {})).toEqual({ score: 0, max: 3, percent: 0 });
  });
  it("requires 90% watched for video completion", () => {
    expect(isVideoComplete(80, 100, false)).toBe(false);
    expect(isVideoComplete(90, 100, false)).toBe(true);
    expect(isVideoComplete(0, 0, false)).toBe(false);
  });
});

describe("formatting", () => {
  it("formats INR, durations and slugs", () => {
    expect(formatMoney(0)).toBe("Free");
    expect(formatMoney(299900)).toBe("₹2,999");
    expect(formatDuration(24)).toBe("24 sec");
    expect(formatDuration(3720)).toBe("1h 2m");
    expect(slugify("IoT with ESP32: Sensors → Cloud!")).toBe("iot-with-esp32-sensors-cloud");
  });
});

describe("applyTax (paid courses)", () => {
  const base = (subtotal: number, discount = 0) => ({ ok: true as const, subtotal, discount, total: subtotal - discount, couponId: null });
  it("adds tax on the post-discount amount, in paise", () => {
    const r = applyTax(base(300000), 1800);
    expect([r.net, r.tax, r.payable]).toEqual([300000, 54000, 354000]);
    expect(applyTax(base(450000, 50000), 1800)).toMatchObject({ net: 400000, tax: 72000, payable: 472000 });
  });
  it("charges no tax when the rate is zero or the amount is zero", () => {
    expect(applyTax(base(600000), 0).payable).toBe(600000);
    expect(applyTax(base(300000, 300000), 1800).payable).toBe(0);
  });
  it("rounds tax to the nearest paisa", () => {
    expect(applyTax(base(333), 1800).tax).toBe(60);
  });
});
