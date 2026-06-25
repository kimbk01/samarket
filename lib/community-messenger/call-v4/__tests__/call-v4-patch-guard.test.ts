import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimCallV4AcceptPatchOnce,
  hasCallV4AcceptPatchDone,
  markCallV4AcceptPatchDone,
  releaseCallV4AcceptPatchClaim,
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

  it("blocks duplicate claim after patch done and allows release on failure", () => {
    expect(claimCallV4AcceptPatchOnce("call-patch")).toBe(true);
    markCallV4AcceptPatchDone("call-patch");
    expect(hasCallV4AcceptPatchDone("call-patch")).toBe(true);
    expect(claimCallV4AcceptPatchOnce("call-patch")).toBe(false);

    resetCallV4PatchClaimsForTests();
    expect(claimCallV4AcceptPatchOnce("call-retry")).toBe(true);
    releaseCallV4AcceptPatchClaim("call-retry", "accept_patch_failed");
    expect(claimCallV4AcceptPatchOnce("call-retry")).toBe(true);
  });
});
