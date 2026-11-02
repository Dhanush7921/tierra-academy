import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetDb, admin, userByEmail, course, closeAll } from "./helpers";
import { createCheckout, processPaymentWebhook, simulateDemoPayment, requestRefund, decideRefund } from "@/lib/services/payments";
import { enrollFree } from "@/lib/services/enrollment";
import { DemoPaymentProvider } from "@/lib/providers/payments";
import { createInvitation, acceptInvitation } from "@/lib/services/invitations";
import { recordProgress, submitQuiz, getQuizForStudent } from "@/lib/services/learning";
import { submitForReview, decideCourse, updateCourseDetails, decideRevision, createCourse } from "@/lib/services/courses-admin";

type U = Awaited<ReturnType<typeof userByEmail>>;
let student: U, student2: U, sa: U, cm: U, cm2: U;
const enrollmentOf = async (userId: string, courseId: string) =>
  (await admin`select status, source from public.enrollments where user_id = ${userId} and course_id = ${courseId}`)[0];

beforeAll(async () => {
  await resetDb();
  [student, student2, sa, cm, cm2] = await Promise.all([
    userByEmail("student@demo.tierra.academy"), userByEmail("student2@demo.tierra.academy"),
    userByEmail("superadmin@demo.tierra.academy"), userByEmail("cm@demo.tierra.academy"), userByEmail("cm2@demo.tierra.academy"),
  ]);
});
afterAll(closeAll);

describe("free enrollment", () => {
  it("enrolls a student into a free course, idempotently", async () => {
    const c = await course("robotics-kinematics-essentials");
    expect(await enrollFree(student2, c.id)).toEqual({ ok: true, alreadyEnrolled: false });
    expect(await enrollFree(student2, c.id)).toEqual({ ok: true, alreadyEnrolled: true });
    const [{ n }] = await admin`select count(*)::int as n from public.enrollments where user_id = ${student2.id} and course_id = ${c.id}`;
    expect(n).toBe(1);
  });
  it("refuses free enrollment into a paid course", async () => {
    const c = await course("build-a-robotic-arm");
    const r = await enrollFree(student2, c.id);
    expect(r.ok).toBe(false);
    expect(await enrollmentOf(student2.id, c.id)).toBeUndefined();
  });
  it("refuses enrollment into unpublished courses", async () => {
    const c = await course("industrial-sensors-review");
    expect((await enrollFree(student2, c.id)).ok).toBe(false);
  });
});

describe("paid checkout + verified webhooks", () => {
  it("keeps the course locked until a verified payment event", async () => {
    const c = await course("build-a-robotic-arm");
    const co = await createCheckout(student2, c.id);
    expect(co.ok).toBe(true);
    if (!co.ok) return;
    expect(co.provider).toBe("demo");
    expect(co.amountPaise).toBe(c.price_paise);
    expect(await enrollmentOf(student2.id, c.id)).toBeUndefined();

    // forged webhook (bad signature) is rejected
    const forged = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_x", order_id: co.providerOrderId, amount: co.amountPaise, currency: "INR" } } } });
    expect((await processPaymentWebhook("demo", forged, "deadbeef", "evt-forged")).status).toBe(400);
    expect(await enrollmentOf(student2.id, c.id)).toBeUndefined();

    // correctly signed event with the WRONG amount is rejected
    const demo = new DemoPaymentProvider(process.env.DEMO_PAYMENT_WEBHOOK_SECRET || "local-demo-webhook-secret-change-me");
    const cheap = demo.buildSignedEvent("payment.captured", { id: "pay_cheap", order_id: co.providerOrderId, amount: 100, currency: "INR" });
    const res = await processPaymentWebhook("demo", cheap.raw, cheap.signature, cheap.eventId);
    expect(res.body).toBe("amount mismatch");
    expect(await enrollmentOf(student2.id, c.id)).toBeUndefined();

    // valid event unlocks the course
    const good = demo.buildSignedEvent("payment.captured", { id: "pay_good", order_id: co.providerOrderId, amount: co.amountPaise, currency: "INR", method: "demo" });
    expect(await processPaymentWebhook("demo", good.raw, good.signature, good.eventId)).toEqual({ status: 200, body: "ok" });
    expect((await enrollmentOf(student2.id, c.id)).status).toBe("ACTIVE");

    // duplicate delivery of the same event is acknowledged and ignored
    expect(await processPaymentWebhook("demo", good.raw, good.signature, good.eventId)).toEqual({ status: 200, body: "duplicate" });
    const [{ n }] = await admin`select count(*)::int as n from public.payments where provider_payment_id = 'pay_good'`;
    expect(n).toBe(1);
    const [o] = await admin`select status from public.orders where id = ${co.orderId}`;
    expect(o.status).toBe("PAID");
  });

  it("demo simulator: failure leaves the course locked, success unlocks it", async () => {
    const c = await course("cad-for-mechanisms");
    const co = await createCheckout(student, c.id);
    if (!co.ok) throw new Error(co.error);
    expect((await simulateDemoPayment(student, co.orderId, "failure")).status).toBe("FAILED");
    expect(await enrollmentOf(student.id, c.id)).toBeUndefined();
    // another user cannot settle someone else's order
    expect((await simulateDemoPayment(student2, co.orderId, "success")).ok).toBe(false);
    expect((await simulateDemoPayment(student, co.orderId, "success")).status).toBe("PAID");
    expect((await enrollmentOf(student.id, c.id)).status).toBe("ACTIVE");
  });

  it("applies coupons server-side; a 100% coupon fulfils without a provider", async () => {
    const c = await course("plc-motor-control-workshop");
    const tenOff = await createCheckout(student2, c.id, "WELCOME10");
    if (!tenOff.ok) throw new Error(tenOff.error);
    expect(tenOff.amountPaise).toBe(Math.round(c.price_paise * 0.9));
    const free = await createCheckout(student2, c.id, "DEMOFREE100");
    if (!free.ok) throw new Error(free.error);
    expect(free).toMatchObject({ provider: "none", amountPaise: 0, fulfilled: true });
    expect((await enrollmentOf(student2.id, c.id)).source).toBe("COUPON");
    expect((await createCheckout(student2, c.id)).ok).toBe(false); // already enrolled
    expect((await createCheckout(student, c.id, "NOPE-CODE")).ok).toBe(false);
  });

  it("refund workflow: student requests, Super Admin approves, access is revoked", async () => {
    const c = await course("rtos-and-communication-buses");
    const co = await createCheckout(student2, c.id);
    if (!co.ok) throw new Error(co.error);
    await simulateDemoPayment(student2, co.orderId, "success");
    const req = await requestRefund(student2, co.orderId, "Changed my mind (test)");
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    expect((await requestRefund(student2, co.orderId, "again")).ok).toBe(false); // only one open request
    expect((await requestRefund(student, co.orderId, "not mine")).ok).toBe(false);
    const d = await decideRefund(sa, req.refundId, true, "Approved (test)");
    expect(d.ok).toBe(true);
    expect((await enrollmentOf(student2.id, c.id)).status).toBe("REFUNDED");
    const [o] = await admin`select status from public.orders where id = ${co.orderId}`;
    expect(o.status).toBe("REFUNDED");
  });
});

describe("invitations", () => {
  it("never bypass payment for paid courses unless complimentary (Super Admin)", async () => {
    const c = await course("analog-circuit-design-studio");
    const plain = await createInvitation(cm, { courseId: (await course("iot-with-esp32")).id });
    const token = plain.link.split("/invite/")[1];
    const r = await acceptInvitation(student2, token);
    expect(r).toMatchObject({ ok: true, enrolled: false });
    if (r.ok) expect(r.redirect).toContain("/checkout/");

    const comp = await createInvitation(sa, { courseId: c.id, grantsComplimentary: true, email: student2.email });
    const res = await acceptInvitation(student2, comp.link.split("/invite/")[1]);
    expect(res).toMatchObject({ ok: true, enrolled: true });
    expect((await enrollmentOf(student2.id, c.id)).source).toBe("COMPLIMENTARY");
  });
  it("Content Managers cannot create complimentary invitations", async () => {
    const c = await course("iot-with-esp32");
    await expect(createInvitation(cm, { courseId: c.id, grantsComplimentary: true })).rejects.toThrow();
  });
  it("email-bound invitations reject other accounts, and single-use links cannot be reused", async () => {
    const c = await course("engineering-drawing-basics");
    const inv = await createInvitation(sa, { courseId: c.id, email: student2.email });
    const t = inv.link.split("/invite/")[1];
    expect((await acceptInvitation(student, t)).ok).toBe(false);
    expect((await acceptInvitation(student2, t)).ok).toBe(true);
    const inv2 = await createInvitation(sa, { courseId: c.id, maxUses: 1 });
    const t2 = inv2.link.split("/invite/")[1];
    await acceptInvitation(student, t2);
    expect((await acceptInvitation(student2, t2)).ok).toBe(false);
  });
});

describe("progress, quizzes and certificates", () => {
  it("issues a certificate only after all requirements are met", async () => {
    const c = await course("electrical-wiring-and-safety");
    await enrollFree(student2, c.id);
    const lessons = await admin`select id from public.lessons where course_id = ${c.id} order by position`;
    const certCount = async () => (await admin`select count(*)::int as n from public.certificates where user_id = ${student2.id} and course_id = ${c.id}`)[0].n;

    // a client claiming "ended" without watching is not enough
    const fake = await recordProgress(student2, { lessonId: lessons[0].id, positionSeconds: 24, watchedDelta: 0, ended: true });
    expect(fake.ok && fake.completed).toBe(false);
    for (const l of lessons) {
      for (let i = 0; i < 3; i++) await recordProgress(student2, { lessonId: l.id, positionSeconds: 8 * (i + 1), watchedDelta: 8 });
    }
    expect(await certCount()).toBe(0); // quiz still required

    const [quiz] = await admin`select id from public.quizzes where course_id = ${c.id}`;
    const q = await getQuizForStudent(student2, quiz.id);
    expect(q?.questions.length).toBeGreaterThan(0);
    expect(JSON.stringify(q?.questions)).not.toContain("correct_index");
    const wrong = Object.fromEntries(q!.questions.map((x) => [x.id, 3]));
    const failed = await submitQuiz(student2, quiz.id, wrong);
    expect(failed.ok && failed.passed).toBe(false);
    if (failed.ok) expect(failed.review.every((r) => r.correctIndex === null)).toBe(true); // key hidden until passed
    expect(await certCount()).toBe(0);

    const keys = await admin`select id, correct_index from public.questions where quiz_id = ${quiz.id}`;
    const right = Object.fromEntries(keys.map((k) => [k.id, k.correct_index]));
    const passed = await submitQuiz(student2, quiz.id, right);
    expect(passed.ok && passed.passed).toBe(true);
    expect(await certCount()).toBe(1);
    expect((await enrollmentOf(student2.id, c.id)).status).toBe("COMPLETED");
    const [cert] = await admin`select verification_code from public.certificates where user_id = ${student2.id} and course_id = ${c.id}`;
    const [v] = await admin`select * from public.verify_certificate(${cert.verification_code})`;
    expect(v.recipient_display).toBe("Demo T."); // "Demo Student Two" → privacy: first name + last initial
  });

  it("students cannot record progress on courses they are not enrolled in", async () => {
    const c = await course("build-a-robotic-arm");
    const [l] = await admin`select id from public.lessons where course_id = ${c.id} and not is_preview limit 1`;
    const r = await recordProgress(student, { lessonId: l.id, positionSeconds: 10, watchedDelta: 10 });
    expect(r.ok).toBe(false);
  });
});

describe("publishing workflow", () => {
  it("DRAFT → REVIEW → REJECTED → REVIEW → APPROVED → PUBLISHED with approval history", async () => {
    const cat = (await admin`select id from public.course_categories where slug = 'embedded'`)[0].id;
    const id = await createCourse(cm, { title: "Workflow Test Course", categoryId: cat, delivery: "RECORDED", level: "BEGINNER" });
    expect((await admin`select count(*)::int as n from public.content_manager_assignments where course_id = ${id} and user_id = ${cm.id}`)[0].n).toBe(1);
    await expect(decideCourse(cm, id, "publish", "")).rejects.toThrow();
    await submitForReview(cm, id, "please review");
    await decideCourse(sa, id, "reject", "add outcomes");
    expect((await admin`select status from public.courses where id = ${id}`)[0].status).toBe("REJECTED");
    await updateCourseDetails(cm, id, { outcomes: ["Outcome A"] });
    await submitForReview(cm, id, "fixed");
    await decideCourse(sa, id, "approve", "looks good");
    await decideCourse(sa, id, "publish", "ship it");
    expect((await admin`select status from public.courses where id = ${id}`)[0].status).toBe("PUBLISHED");
    const hist = await admin`select status from public.approval_requests where course_id = ${id} order by created_at`;
    expect(hist.map((h) => h.status)).toEqual(["REJECTED", "APPROVED"]);
  });

  it("CM edits to a published course become a revision that a Super Admin applies", async () => {
    const c = await course("embedded-c-microcontrollers");
    const r = await updateCourseDetails(cm, c.id, { subtitle: "Revised subtitle (test)" });
    expect(r.mode).toBe("revision");
    expect((await course("embedded-c-microcontrollers")).subtitle).not.toBe("Revised subtitle (test)");
    if (r.mode === "revision") await decideRevision(sa, r.revisionId, true, "ok");
    expect((await course("embedded-c-microcontrollers")).subtitle).toBe("Revised subtitle (test)");
  });

  it("unassigned Content Managers cannot edit a course", async () => {
    const c = await course("embedded-c-microcontrollers");
    await expect(updateCourseDetails(cm2, c.id, { subtitle: "nope" })).rejects.toThrow();
  });
});
