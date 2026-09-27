import { expect, test } from "@playwright/test";

import { signUpAndConfirm, uniqueEmail } from "./helpers";

test("client signs up and lands on the client dashboard; engineer area is 403", async ({ page }) => {
  await signUpAndConfirm(page, "client", uniqueEmail("client"));

  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();

  const res = await page.goto("/engineer");
  expect(res?.status()).toBe(403);
  await expect(page.getByRole("heading", { name: /403/ })).toBeVisible();

  // /dashboard sends them back to their own area.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/client$/);
});

test("engineer signs up and lands on the engineer dashboard; client area is 403", async ({ page }) => {
  await signUpAndConfirm(page, "engineer", uniqueEmail("engineer"));

  await expect(page).toHaveURL(/\/engineer$/);
  await expect(page.getByRole("heading", { name: "Engineer dashboard" })).toBeVisible();

  const res = await page.goto("/client");
  expect(res?.status()).toBe(403);
});

test("sign out, then log back in to the right dashboard", async ({ page }) => {
  const email = uniqueEmail("relogin");
  await signUpAndConfirm(page, "engineer", email);
  await expect(page).toHaveURL(/\/engineer$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/engineer$/);
});

test("unconfirmed users can't log in", async ({ page }) => {
  const email = uniqueEmail("unconfirmed");
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Pending");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Log in" }).click();
  // Filter: Next.js's route announcer also has role="alert".
  await expect(page.getByRole("alert").filter({ hasText: "Confirm your email" })).toBeVisible();
});

test("logged-out visitors are redirected to /login", async ({ page }) => {
  for (const path of ["/client", "/engineer", "/dashboard", "/onboarding"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});
