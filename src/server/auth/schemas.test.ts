import { describe, expect, it } from "vitest";

import { loginSchema, onboardingSchema, signupHintSchema, signupSchema } from "./schemas";

const valid = { email: "Artist@Example.com ", password: "correct horse", displayName: "  Ana ", role: "client" };

describe("signupSchema", () => {
  it("normalises email and trims the display name", () => {
    expect(signupSchema.parse(valid)).toEqual({
      email: "artist@example.com",
      password: "correct horse",
      displayName: "Ana",
      role: "client",
    });
  });

  it.each([
    ["an unknown role", { role: "admin" }],
    ["a missing role", { role: undefined }],
    ["a bad email", { email: "not-an-email" }],
    ["a short password", { password: "short" }],
    ["a >72 char password", { password: "x".repeat(73) }],
    ["a blank display name", { displayName: "   " }],
    ["a >60 char display name", { displayName: "x".repeat(61) }],
  ])("rejects %s", (_label, override) => {
    expect(signupSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("ignores extra fields such as a client-supplied userId", () => {
    const parsed = signupSchema.parse({ ...valid, userId: "someone-else", id: "x" });
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("id");
  });
});

describe("loginSchema", () => {
  it("accepts any non-empty password (policy is enforced at signup)", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("onboardingSchema", () => {
  it("only allows client or engineer", () => {
    expect(onboardingSchema.safeParse({ displayName: "A", role: "engineer" }).success).toBe(true);
    expect(onboardingSchema.safeParse({ displayName: "A", role: "admin" }).success).toBe(false);
  });
});

describe("signupHintSchema", () => {
  it("parses Supabase user_metadata written at signup", () => {
    expect(signupHintSchema.parse({ role: "engineer", display_name: "Mo", email_verified: true })).toEqual({
      role: "engineer",
      display_name: "Mo",
    });
  });

  it("rejects tampered or missing metadata", () => {
    expect(signupHintSchema.safeParse({ role: "admin", display_name: "Mo" }).success).toBe(false);
    expect(signupHintSchema.safeParse({}).success).toBe(false);
  });
});
