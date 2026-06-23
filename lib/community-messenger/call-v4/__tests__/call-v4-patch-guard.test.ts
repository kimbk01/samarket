import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimCallV4AcceptPatchOnce,
  resetCallV4PatchClaimsForTests,
} from "@/lib/community-messenger/call-v4/call-v4-patch-guard";

describe("call-v4 accept patch guard", () => {
  beforeEach(() => {
    resetCallV4PatchClaimsForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("logs accept_once_skip_duplicate on duplicate accept patch claim", () => {
    const info = vi.spyOn(console, "info");
    expect(claimCallV4AcceptPatchOnce("call-patch")).toBe(true);
    expect(claimCallV4AcceptPatchOnce("call-patch")).toBe(false);
    expect(info.mock.calls.some((call) => call[1] === "accept_once_skip_duplicate")).toBe(true);
  });
});
