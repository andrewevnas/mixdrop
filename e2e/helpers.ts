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
