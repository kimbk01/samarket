import { describe, expect, it } from "vitest";
import { resolveAuthExitHref } from "@/lib/auth/navigate-after-auth-exit";

describe("resolveAuthExitHref", () => {
  it("logout always lands on login screen", () => {
    expect(resolveAuthExitHref("logout")).toBe("/login?reason=logout");
  });
});
