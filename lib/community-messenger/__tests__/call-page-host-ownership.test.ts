import { describe, expect, it } from "vitest";
import { decideCommunityCallPageHostOwnership } from "@/lib/community-messenger/call-page-host-ownership";

describe("decideCommunityCallPageHostOwnership", () => {
  it("allows loading when host owns and runtime session is active", () => {
    const decision = decideCommunityCallPageHostOwnership({
      hostOwnsSession: true,
      isTerminalSuppressed: false,
      runtimeSessionId: "session-1",
      runtimeSessionStatus: "active",
      routeSessionId: "session-1",
    });
    expect(decision.allowHostLoading).toBe(true);
    expect(decision.shouldClearStaleOwnership).toBe(false);
  });

  it("blocks loading when terminal is suppressed", () => {
    const decision = decideCommunityCallPageHostOwnership({
      hostOwnsSession: true,
      isTerminalSuppressed: true,
      runtimeSessionId: "session-1",
      runtimeSessionStatus: "active",
      routeSessionId: "session-1",
    });
    expect(decision.allowHostLoading).toBe(false);
    expect(decision.shouldClearStaleOwnership).toBe(true);
  });

  it("blocks loading and clears stale ownership when runtime is missing", () => {
    const decision = decideCommunityCallPageHostOwnership({
      hostOwnsSession: true,
      isTerminalSuppressed: false,
      runtimeSessionId: null,
      runtimeSessionStatus: null,
      routeSessionId: "session-1",
    });
    expect(decision.allowHostLoading).toBe(false);
    expect(decision.shouldClearStaleOwnership).toBe(true);
  });
});
