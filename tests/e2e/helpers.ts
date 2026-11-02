import { expect, type Page } from "@playwright/test";

export const PW = process.env.DEMO_USER_PASSWORD ?? "";
export const USERS = {
  student: "student@demo.tierra.academy",
  student2: "student2@demo.tierra.academy",
  cm: "cm@demo.tierra.academy",
  sa: "superadmin@demo.tierra.academy",
};

export async function login(page: Page, email: string, password = PW) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
