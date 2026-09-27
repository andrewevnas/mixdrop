import { describe, expect, it } from "vitest";

import type { Profile, Role } from "@/db/schema";

import { authorize, dashboardPathFor } from "./roles";

const profile = (role: Role): Profile => ({
  id: "00000000-0000-0000-0000-000000000001",
  role,
  displayName: "Test",
  createdAt: new Date(0),
});

describe("authorize", () => {
  it.each(["client", "engineer", "any"] as const)("no profile → no-profile (required=%s)", (required) => {
    expect(authorize(null, required)).toEqual({ kind: "no-profile" });
  });

  it.each([
    ["client", "client", "ok"],
    ["engineer", "engineer", "ok"],
    ["client", "engineer", "forbidden"],
    ["engineer", "client", "forbidden"],
    ["client", "any", "ok"],
    ["engineer", "any", "ok"],
  ] as const)("%s accessing %s area → %s", (role, required, kind) => {
    expect(authorize(profile(role), required).kind).toBe(kind);
  });

  it("returns the profile when allowed", () => {
    const p = profile("engineer");
    expect(authorize(p, "engineer")).toEqual({ kind: "ok", profile: p });
  });
});

describe("dashboardPathFor", () => {
  it("routes each role to its own dashboard", () => {
    expect(dashboardPathFor("client")).toBe("/client");
    expect(dashboardPathFor("engineer")).toBe("/engineer");
  });
});
