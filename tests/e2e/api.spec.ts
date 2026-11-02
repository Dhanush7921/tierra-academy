import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test("health endpoint reports DB connectivity and provider modes", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.ok()).toBeTruthy();
  expect((await r.json()).providers).toBeTruthy();
});

test("payment webhooks with invalid signatures are rejected", async ({ request }) => {
  const r = await request.post("/api/payments/webhook/razorpay", { data: { event: "payment.captured" }, headers: { "x-razorpay-signature": "forged" } });
  expect(r.status()).toBe(400);
});

test("video playback requires sign-in", async ({ request }) => {
  const r = await request.get("/api/videos/playback/00000000-0000-0000-0000-000000000000");
  expect(r.status()).toBe(401);
});

test("cross-site POSTs are blocked (CSRF)", async ({ page }) => {
  await login(page, USERS.student);
  const r = await page.request.post("/api/progress", { data: { lessonId: "00000000-0000-0000-0000-000000000000", positionSeconds: 1, watchedDelta: 1 }, headers: { Origin: "https://evil.example" } });
  expect(r.status()).toBe(403);
});

test("students get 403 from admin APIs", async ({ page }) => {
  await login(page, USERS.student);
  const r = await page.request.post("/api/videos/upload-url", { data: { courseId: "00000000-0000-0000-0000-000000000000", filename: "a.mp4", sizeBytes: 10 }, headers: { Origin: new URL(page.url()).origin } });
  expect(r.status()).toBe(403);
});

test("cron endpoints require the cron secret", async ({ request }) => {
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
});
