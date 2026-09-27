import { expect, type Page, test } from "@playwright/test";

import { setUpEngineerWithService, signUpAndConfirm, uniqueEmail } from "./helpers";

const progress = (page: Page) => page.getByRole("list", { name: "Order progress" });
const currentStep = (page: Page) => progress(page).locator('[aria-current="step"]');

test("client orders, pays (simulated), engineer accepts and starts; progress bar follows", async ({ browser }) => {
  const engineer = await (await browser.newContext()).newPage();
  const client = await (await browser.newContext()).newPage();

  const slug = await setUpEngineerWithService(engineer);

  // Client orders from the public page.
  await signUpAndConfirm(client, "client", uniqueEmail("buyer"));
  await client.goto(`/e/${slug}`);
  await client.getByRole("link", { name: "Order" }).click();
  await client.getByLabel("Song title").fill("Night Drive");
  await client.getByLabel("Artist name").fill("Ana");
  await client.getByLabel("Brief").fill("Warm, wide chorus.");
  await client.getByLabel(/Reference tracks/).fill("https://example.com/ref");
  await client.getByRole("button", { name: "Place order" }).click();

  await expect(client).toHaveURL(/\/client\/orders\/[0-9a-f-]{36}$/);
  const orderUrl = new URL(client.url()).pathname;
  const orderId = orderUrl.split("/").at(-1)!;
  await expect(client.getByTestId("order-status")).toHaveText("Awaiting payment");
  await expect(client.getByText("£49.99")).toBeVisible();
  await expect(currentStep(client)).toContainText("Submitted");

  // Engineers never see unpaid drafts.
  await engineer.goto("/engineer/orders");
  await expect(engineer.getByText("Night Drive")).toHaveCount(0);

  await client.getByRole("button", { name: "Simulate payment" }).click();
  await expect(client.getByTestId("order-status")).toHaveText("New — awaiting acceptance");

  // Engineer accepts and starts.
  await engineer.goto("/engineer/orders");
  await engineer.getByTestId("order-row").filter({ hasText: "Night Drive" }).click();
  await expect(engineer).toHaveURL(`/engineer/orders/${orderId}`);
  await expect(engineer.getByText("Warm, wide chorus.")).toBeVisible();
  await engineer.getByRole("button", { name: "Accept order" }).click();
  await expect(engineer.getByTestId("order-status")).toHaveText("Accepted");
  await engineer.getByRole("button", { name: "Start work" }).click();
  await expect(engineer.getByTestId("order-status")).toHaveText("In progress");
  // Delivering needs an upload (Phase 5).
  await expect(engineer.getByRole("button", { name: "Mark delivered" })).toBeDisabled();

  // Client's progress bar is rebuilt from events.
  await client.reload();
  await expect(currentStep(client)).toContainText("In progress");
  await expect(progress(client).locator('[data-state="done"]')).toHaveText(["Submitted", "Accepted"]);
  await expect(client.getByText("Order created")).toBeVisible();
});

test("other users can't open someone else's order", async ({ browser }) => {
  const engineer = await (await browser.newContext()).newPage();
  const client = await (await browser.newContext()).newPage();
  const slug = await setUpEngineerWithService(engineer);

  await signUpAndConfirm(client, "client", uniqueEmail("owner"));
  await client.goto(`/e/${slug}`);
  await client.getByRole("link", { name: "Order" }).click();
  await client.getByLabel("Song title").fill("Private Song");
  await client.getByLabel("Artist name").fill("Ana");
  await client.getByRole("button", { name: "Place order" }).click();
  await expect(client).toHaveURL(/\/client\/orders\/[0-9a-f-]{36}$/);
  const orderId = new URL(client.url()).pathname.split("/").at(-1)!;
  await client.getByRole("button", { name: "Simulate payment" }).click();
  await expect(client.getByTestId("order-status")).toHaveText("New — awaiting acceptance");

  // A different engineer.
  const stranger = await (await browser.newContext()).newPage();
  await setUpEngineerWithService(stranger, { service: "Other" });
  expect((await stranger.goto(`/engineer/orders/${orderId}`))?.status()).toBe(404);

  // A different client.
  const otherClient = await (await browser.newContext()).newPage();
  await signUpAndConfirm(otherClient, "client", uniqueEmail("snoop"));
  expect((await otherClient.goto(`/client/orders/${orderId}`))?.status()).toBe(404);
});

test("reference links must be http(s)", async ({ browser }) => {
  const engineer = await (await browser.newContext()).newPage();
  const client = await (await browser.newContext()).newPage();
  const slug = await setUpEngineerWithService(engineer);
  await signUpAndConfirm(client, "client", uniqueEmail("xss"));
  await client.goto(`/e/${slug}`);
  await client.getByRole("link", { name: "Order" }).click();
  await client.getByLabel("Song title").fill("S");
  await client.getByLabel("Artist name").fill("A");
  await client.getByLabel(/Reference tracks/).fill("javascript:alert(1)");
  await client.getByRole("button", { name: "Place order" }).click();
  await expect(client.getByText(/Links must start with http/)).toBeVisible();
});
