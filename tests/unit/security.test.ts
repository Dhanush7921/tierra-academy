import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt } from "@/lib/auth/jwt";
import { hotp, verifyTotp, base32Decode, base32Encode, generateTotpSecret } from "@/lib/auth/totp";
import { hashPassword, verifyPassword, encrypt, decrypt, hmacHex, safeEqual, certificateCode } from "@/lib/crypto";
import { can, PERMISSIONS, type Role } from "@/lib/rbac";
import { safeNext } from "@/lib/paths";
import { sniffMime, validateUpload } from "@/lib/providers/storage";
import { DemoPaymentProvider, RazorpayProvider, verifyRazorpayCheckoutSignature } from "@/lib/providers/payments";

const SECRET = "unit-test-secret-0123456789abcdefghijklmnop";

describe("session JWT", () => {
  it("round-trips valid claims", async () => {
    const t = await signJwt({ sub: "u1", email: "a@b.c", role: "authenticated", aal: 1, sv: 3 }, SECRET, 60);
    expect((await verifyJwt(t, SECRET))?.sub).toBe("u1");
  });
  it("rejects tampering, wrong secret, expiry and alg confusion", async () => {
    const t = await signJwt({ sub: "u1", email: "a@b.c", role: "authenticated", aal: 1, sv: 1 }, SECRET, 60);
    const [h, p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), sub: "admin" })).toString("base64url");
    expect(await verifyJwt(`${h}.${forged}.${s}`, SECRET)).toBeNull();
    expect(await verifyJwt(t, SECRET + "x")).toBeNull();
    expect(await verifyJwt(await signJwt({ sub: "u1", email: "", role: "authenticated", aal: 1, sv: 1 }, SECRET, -10), SECRET)).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${p}.`;
    expect(await verifyJwt(none, SECRET)).toBeNull();
  });
});

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC test vector", () => {
    // RFC 4226 secret "12345678901234567890", counter 1 → 287082
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(hotp(secret, 1)).toBe("287082");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("accepts ±1 step and rejects others", () => {
    const s = generateTotpSecret();
    const now = Date.now();
    const step = Math.floor(now / 30000);
    expect(verifyTotp(s, hotp(s, step), now)).toBe(step);
    expect(verifyTotp(s, hotp(s, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(s, hotp(s, step + 5), now)).toBeNull();
    expect(verifyTotp(s, "abc123", now)).toBeNull();
  });
});

describe("crypto helpers", () => {
  it("hashes and verifies passwords with scrypt", async () => {
    const h = await hashPassword("Correct horse 42");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Correct horse 42", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
  it("encrypts secrets at rest with AES-GCM and detects tampering", () => {
    const c = encrypt("JBSWY3DPEHPK3PXP", SECRET);
    expect(decrypt(c, SECRET)).toBe("JBSWY3DPEHPK3PXP");
    expect(() => decrypt(c.slice(0, -2) + "AA", SECRET)).toThrow();
  });
  it("generates certificate codes in the verifiable format", () => {
    expect(certificateCode()).toMatch(/^TA-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

describe("RBAC matrix", () => {
  const cm: Role[] = ["CONTENT_MANAGER"], st: Role[] = ["STUDENT"], sa: Role[] = ["SUPER_ADMIN"];
  it("Content Managers can never publish, price, refund, view revenue, manage settings or users", () => {
    for (const p of ["course.publish", "course.pricing", "refunds.issue", "revenue.view", "settings.manage", "users.manage", "team.manage", "invitation.complimentary", "audit.view"] as const)
      expect(can(cm, p)).toBe(false);
    for (const p of ["course.create", "media.upload", "quiz.manage", "live.propose", "live.host", "course.submitForReview"] as const) expect(can(cm, p)).toBe(true);
  });
  it("students have no admin permissions", () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) if (p !== "student.learn") expect(can(st, p)).toBe(false);
  });
  it("Super Admins hold every admin permission", () => {
    for (const p of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) expect(can(sa, p)).toBe(true);
  });
});

describe("open-redirect protection", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/dashboard/courses")).toBe("/dashboard/courses");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("/\\evil.example")).toBe("/dashboard");
    expect(safeNext(undefined, "/x")).toBe("/x");
  });
});

describe("upload validation (magic bytes)", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(32)]);
  it("detects real file types regardless of the declared name", () => {
    expect(sniffMime(png)?.mime).toBe("image/png");
    expect(sniffMime(pdf)?.mime).toBe("application/pdf");
    expect(sniffMime(Buffer.from("<script>alert(1)</script>........"))).toBeNull();
  });
  it("enforces allow-lists and size limits", () => {
    expect(() => validateUpload(png, ["application/pdf"], 1024)).toThrow("Unsupported");
    expect(() => validateUpload(pdf, ["application/pdf"], 10)).toThrow("too large");
    expect(validateUpload(pdf, ["application/pdf"], 1024).ext).toBe("pdf");
  });
});

describe("payment signatures", () => {
  it("verifies Razorpay checkout and webhook HMACs", () => {
    const sig = hmacHex("key_secret", "order_1|pay_1");
    expect(verifyRazorpayCheckoutSignature("order_1", "pay_1", sig, "key_secret")).toBe(true);
    expect(verifyRazorpayCheckoutSignature("order_1", "pay_2", sig, "key_secret")).toBe(false);
    const rz = new RazorpayProvider("k", "s", "whsec");
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_9", order_id: "order_9", amount: 1000, currency: "INR" } } } });
    expect(rz.verifyWebhookSignature(body, hmacHex("whsec", body))).toBe(true);
    expect(rz.verifyWebhookSignature(body, hmacHex("other", body))).toBe(false);
    expect(rz.verifyWebhookSignature(body, null)).toBe(false);
    expect(rz.parseWebhook(body, "evt_1")).toMatchObject({ type: "payment.captured", providerOrderId: "order_9", amountPaise: 1000 });
  });
  it("demo provider events are server-signed and verifiable", () => {
    const d = new DemoPaymentProvider("demo-secret");
    const e = d.buildSignedEvent("payment.captured", { id: "p", order_id: "o", amount: 5 });
    expect(d.verifyWebhookSignature(e.raw, e.signature)).toBe(true);
    expect(new DemoPaymentProvider("other").verifyWebhookSignature(e.raw, e.signature)).toBe(false);
  });
});
