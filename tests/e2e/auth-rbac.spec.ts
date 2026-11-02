import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test("protected routes redirect anonymous visitors to sign-in", async ({ page }) => {
  for (const path of ["/dashboard", "/admin", "/admin/orders", "/dashboard/payments", "/checkout/build-a-robotic-arm"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
});

test("a new student can register and lands in their lab", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E Student");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("Sup3rSecretPw!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create student account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Hello, E2E/ })).toBeVisible();
});

test("wrong password shows a generic error (no account enumeration)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS.student);
  await page.getByLabel("Password").fill("definitely-wrong-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

test("students cannot open the admin panel", async ({ page }) => {
  await login(page, USERS.student);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard\?denied=admin/);
});

test("Content Managers cannot reach pricing, payments, settings or users", async ({ page }) => {
  await login(page, USERS.cm);
  for (const path of ["/admin/orders", "/admin/coupons", "/admin/settings", "/admin/users", "/admin/team", "/admin/audit", "/admin/approvals"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\?denied=1/);
  }
  await expect(page.getByRole("navigation", { name: /Content Manager navigation/ })).not.toContainText("Orders & refunds");
});

test("Content Managers see read-only pricing on assigned courses", async ({ page }) => {
  await login(page, USERS.cm);
  await page.goto("/admin/courses");
  await page.getByRole("link", { name: /Embedded C on Microcontrollers/ }).click();
  await page.getByRole("link", { name: "Pricing" }).click();
  await expect(page.getByText("Pricing is managed by a Super Admin.")).toBeVisible();
});

test("Super Admin sees revenue and pending approvals", async ({ page }) => {
  await login(page, USERS.sa);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText("Net revenue")).toBeVisible();
  await page.goto("/admin/approvals");
  await expect(page.getByRole("heading", { name: "Pending approvals" })).toBeVisible();
});
