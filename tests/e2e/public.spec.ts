import { test, expect } from "@playwright/test";

test("homepage renders the cinematic hero with working CTAs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Learn. Build. Automate.");
  await expect(page.getByRole("link", { name: /Explore Courses/ })).toHaveAttribute("href", /\/courses$/);
  await expect(page.getByRole("link", { name: /Join Live Classes/ })).toHaveAttribute("href", /\/live$/);
  await expect(page.getByText("DEMO MODE")).toBeVisible();
});

test("skip-to-content link is the first focusable element", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("catalogue filters by discipline and search", async ({ page }) => {
  await page.goto("/courses?category=robotics");
  await expect(page.getByRole("heading", { name: "Robotics courses" })).toBeVisible();
  await page.goto("/courses?q=ESP32");
  await expect(page.getByRole("heading", { name: /IoT with ESP32/ })).toBeVisible();
});

test("course page shows curriculum and locks paid content", async ({ page }) => {
  await page.goto("/courses/build-a-robotic-arm");
  await expect(page.getByRole("heading", { name: "Curriculum" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Buy course" })).toBeVisible();
});

test("unknown pages return the 404 page", async ({ page }) => {
  const res = await page.goto("/this-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("This circuit is open.")).toBeVisible();
});

test("certificate verification handles unknown IDs", async ({ page }) => {
  await page.goto("/verify/TA-AAAA-BBBB-CCCC");
  await expect(page.getByText("No certificate found")).toBeVisible();
});

test("theme switcher persists across navigation", async ({ page }) => {
  await page.goto("/courses");
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  await page.getByRole("button", { name: /Switch to/ }).click();
  await page.goto("/faq");
  expect(await html.getAttribute("data-theme")).not.toBe(before);
});
