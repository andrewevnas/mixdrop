import { expect, type Page } from "@playwright/test";

// Local Supabase's Mailpit inbox (see `pnpm sb:status`).
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function confirmationLink(email: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        if (!messages?.length) return false;
        const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as {
          HTML: string;
        };
        link = msg.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
        return !!link;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return link!;
}

export async function signUpAndConfirm(page: Page, role: "client" | "engineer", email: string) {
  await page.goto("/signup");
  await page.getByLabel(role === "engineer" ? "I'm an engineer" : "I'm an artist").check();
  await page.getByLabel("Display name").fill(`E2E ${role}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");

  // Same browser context, so the PKCE verifier cookie set at signup is present.
  await page.goto(await confirmationLink(email));
}

/** Signed-in engineer with a public profile and one active service. Returns the public slug. */
export async function setUpEngineerWithService(
  page: Page,
  { service = "Full mix", price = "49.99" }: { service?: string; price?: string } = {},
): Promise<string> {
  const slug = `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await signUpAndConfirm(page, "engineer", uniqueEmail("eng"));
  await page.goto("/engineer/profile");
  await page.getByLabel(/Public URL/).fill(slug);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  await page.goto("/engineer/services/new");
  await page.getByLabel("Name").fill(service);
  await page.getByLabel("Price (£)").fill(price);
  await page.getByRole("button", { name: "Add service" }).click();
  await expect(page).toHaveURL(/\/engineer\/services$/);
  return slug;
}

/** A client (signed in on `client`) with a paid order on a fresh engineer's service. Returns the order id. */
export async function createPaidOrder(client: Page, engineer: Page, songTitle = "Night Drive"): Promise<string> {
  const slug = await setUpEngineerWithService(engineer);
  await signUpAndConfirm(client, "client", uniqueEmail("artist"));
  await client.goto(`/e/${slug}`);
  await client.getByRole("link", { name: "Order" }).click();
  await client.getByLabel("Song title").fill(songTitle);
  await client.getByLabel("Artist name").fill("Ana");
  await client.getByRole("button", { name: "Place order" }).click();
  await expect(client).toHaveURL(/\/client\/orders\/[0-9a-f-]{36}$/);
  await client.getByRole("button", { name: "Simulate payment" }).click();
  await expect(client.getByTestId("order-status")).toHaveText("New — awaiting acceptance");
  return new URL(client.url()).pathname.split("/").at(-1)!;
}

export const r2Configured = () =>
  !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);

/** Make showDirectoryPicker() hand back the origin-private file system, which tests can read back. */
export async function stubDirectoryPickerWithOpfs(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker =
      async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle("download", { create: true });
      };
  });
}

/** Every file under the stubbed download folder: { "Session/Audio Files/Kick.wav": size }. */
export async function readOpfsTree(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async () => {
    const out: Record<string, number> = {};
    type Dir = FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };
    async function walk(dir: Dir, prefix: string) {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === "directory") await walk(handle as Dir, `${prefix}${name}/`);
        else out[`${prefix}${name}`] = (await (handle as FileSystemFileHandle).getFile()).size;
      }
    }
    const root = await navigator.storage.getDirectory();
    await walk((await root.getDirectoryHandle("download")) as Dir, "");
    return out;
  });
}
