import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins conditional classes and resolves Tailwind conflicts", () => {
    expect(cn("px-2 py-1", false && "hidden", { "text-white": true }, "px-4")).toBe(
      "py-1 text-white px-4",
    );
  });
});
