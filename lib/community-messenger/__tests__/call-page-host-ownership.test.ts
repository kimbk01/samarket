import { describe, expect, it } from "vitest";
import {
  decideCommunityCallActiveHostOwnership,
  decideCommunityCallPageHostOwnership,
} from "@/lib/community-messenger/call-page-host-ownership";

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

  it("preserves ownership during outgoing bootstrap without runtime", () => {
    const decision = decideCommunityCallPageHostOwnership({
      hostOwnsSession: true,
      isTerminalSuppressed: false,
      runtimeSessionId: null,
      runtimeSessionStatus: null,
      routeSessionId: "session-1",
      hasLiveActiveCallSession: true,
    });
    expect(decision.allowHostLoading).toBe(false);
    expect(decision.shouldClearStaleOwnership).toBe(false);
  });
});

describe("decideCommunityCallActiveHostOwnership", () => {
  it("does not mount on dedicated call route during bootstrap (page owns)", () => {
    const decision = decideCommunityCallActiveHostOwnership({
      hostedSessionId: "tmp_abc",
      isTerminalSuppressed: false,
      isHostedActiveOnly: true,
      onCallSessionRoute: true,
      hasNavigationSeed: false,
      hasLiveActiveCallSession: false,
      runtimeSessionId: null,
      runtimeSessionStatus: null,
    });
    expect(decision.shouldMountCallClient).toBe(false);
    expect(decision.shouldClearStaleOwnership).toBe(false);
  });

  it("mounts in-place video accept on messenger home when navigation seed exists", () => {
    const decision = decideCommunityCallActiveHostOwnership({
      hostedSessionId: "session-inplace",
      isTerminalSuppressed: false,
      isHostedActiveOnly: true,
      onCallSessionRoute: false,
      hasNavigationSeed: true,
      hasLiveActiveCallSession: false,
      runtimeSessionId: null,
      runtimeSessionStatus: null,
    });
    expect(decision.shouldMountCallClient).toBe(true);
    expect(decision.shouldClearStaleOwnership).toBe(false);
  });

  it("clears stale hostedActive on messenger home without mounting CallClient", () => {
    const decision = decideCommunityCallActiveHostOwnership({
      hostedSessionId: "session-stale",
      isTerminalSuppressed: false,
      isHostedActiveOnly: true,
      onCallSessionRoute: false,
      hasNavigationSeed: false,
      hasLiveActiveCallSession: false,
      runtimeSessionId: null,
      runtimeSessionStatus: null,
    });
    expect(decision.shouldMountCallClient).toBe(false);
    expect(decision.shouldClearStaleOwnership).toBe(true);
  });

  it("clears when runtime session mismatches hosted session", () => {
    const decision = decideCommunityCallActiveHostOwnership({
      hostedSessionId: "session-a",
      isTerminalSuppressed: false,
      isHostedActiveOnly: false,
      onCallSessionRoute: false,
      hasNavigationSeed: false,
      hasLiveActiveCallSession: false,
      runtimeSessionId: "session-b",
      runtimeSessionStatus: "active",
    });
    expect(decision.shouldMountCallClient).toBe(false);
    expect(decision.shouldClearStaleOwnership).toBe(true);
  });

  it("clears terminal runtime without mounting CallClient", () => {
    const decision = decideCommunityCallActiveHostOwnership({
      hostedSessionId: "session-1",
      isTerminalSuppressed: false,
      isHostedActiveOnly: false,
      onCallSessionRoute: true,
      hasNavigationSeed: false,
      hasLiveActiveCallSession: false,
      runtimeSessionId: "session-1",
      runtimeSessionStatus: "ended",
    });
    expect(decision.shouldMountCallClient).toBe(false);
    expect(decision.shouldClearStaleOwnership).toBe(true);
  });

  it("does not mount host CallClient on dedicated call route (page owns)", () => {
    const decision = decideCommunityCallActiveHostOwnership({
      hostedSessionId: "session-1",
      isTerminalSuppressed: false,
      isHostedActiveOnly: false,
      onCallSessionRoute: true,
      hasNavigationSeed: false,
      hasLiveActiveCallSession: true,
      runtimeSessionId: "session-1",
      runtimeSessionStatus: "ringing",
    });
    expect(decision.shouldMountCallClient).toBe(false);
    expect(decision.shouldClearStaleOwnership).toBe(false);
  });
});
