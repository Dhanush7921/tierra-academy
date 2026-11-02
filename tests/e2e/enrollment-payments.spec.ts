import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test.describe.configure({ mode: "serial" });

test("free enrollment unlocks the course immediately", async ({ page }) => {
  await login(page, USERS.student2);
  await page.goto("/courses/engineering-drawing-basics");
  await page.getByRole("button", { name: /Enroll for free/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/courses/);
  await expect(page.getByText("Engineering Drawing Basics")).toBeVisible();
});

test("demo payment failure keeps the course locked; success unlocks it", async ({ page }) => {
  await login(page, USERS.student2);
  await page.goto("/checkout/cad-for-mechanisms");
  await page.getByRole("button", { name: /Continue to demo payment/ }).click();
  await expect(page.getByText("DEMO PAYMENT SIMULATOR")).toBeVisible();
  await page.getByRole("button", { name: "Fail" }).click();
  await expect(page.getByText(/course remains locked/)).toBeVisible();
  await page.goto("/courses/cad-for-mechanisms");
  await expect(page.getByRole("link", { name: "Buy course" })).toBeVisible();

  await page.goto("/checkout/cad-for-mechanisms");
  await page.getByRole("button", { name: /Continue to demo payment/ }).click();
  await page.getByRole("button", { name: "Succeed" }).click();
  await expect(page).toHaveURL(/\/dashboard\/courses\?enrolled=cad-for-mechanisms/);
  await page.goto("/dashboard/payments");
  await expect(page.getByText("CAD for Mechanisms")).toBeVisible();
});

test("100% coupon fulfils without a payment provider", async ({ page }) => {
  await login(page, USERS.student2);
  await page.goto("/checkout/plc-motor-control-workshop");
  await page.getByLabel(/Coupon code/).fill("DEMOFREE100");
  await page.getByRole("button", { name: /Continue to demo payment/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/courses/);
});
