import { expect, test } from "@playwright/test";

import { signUpAndConfirm, uniqueEmail } from "./helpers";

test("logged-out visitor sees an engineer's active services and prices", async ({ page, browser }) => {
  const slug = `e2e-${Date.now().toString(36)}`;
  await signUpAndConfirm(page, "engineer", uniqueEmail("pro"));
  await expect(page).toHaveURL(/\/engineer$/);

  // Profile
  await page.getByRole("link", { name: "Set up your profile" }).click();
  await page.getByLabel(/Public URL/).fill(slug);
  await page.getByLabel("Bio").fill("Grammy-adjacent mixes from a shed in Leeds.");
  await page.getByLabel(/Genres/).fill("hip-hop, r&b");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");

  // Two services; hide the second.
  for (const [name, price] of [
    ["Full mix", "49.99"],
    ["Stem master", "30"],
  ]) {
    await page.goto("/engineer/services/new");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Price (£)").fill(price);
    await page.getByRole("button", { name: "Add service" }).click();
    await expect(page).toHaveURL(/\/engineer\/services$/);
  }
  const stemRow = page.getByTestId("service-row").filter({ hasText: "Stem master" });
  await stemRow.getByRole("button", { name: "Hide" }).click();
  await expect(stemRow.getByText("Hidden")).toBeVisible();

  // Fresh, logged-out context.
  const visitor = await (await browser.newContext()).newPage();
  const res = await visitor.goto(`/e/${slug}`);
  expect(res?.status()).toBe(200);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("E2E engineer");
  await expect(visitor.getByText("Grammy-adjacent mixes")).toBeVisible();
  await expect(visitor.getByText("r&b")).toBeVisible();

  const services = visitor.getByTestId("public-service");
  await expect(services).toHaveCount(1);
  await expect(services.first()).toContainText("Full mix");
  await expect(services.first()).toContainText("£49.99");
  await expect(visitor.getByText("Stem master")).toHaveCount(0);

  // Unknown engineer → 404.
  const missing = await visitor.goto(`/e/${slug}-nope`);
  expect(missing?.status()).toBe(404);
});

test("invalid price is rejected with a field error", async ({ page }) => {
  await signUpAndConfirm(page, "engineer", uniqueEmail("badprice"));
  await page.goto("/engineer/profile");
  await page.getByLabel(/Public URL/).fill(`bp-${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");

  await page.goto("/engineer/services/new");
  await page.getByLabel("Name").fill("Cheap mix");
  await page.getByLabel("Price (£)").fill("4.99");
  await page.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByText("At least £5")).toBeVisible();
});
