import { beforeEach, describe, expect, it } from "vitest";
import {
  claimCallRouteLatch,
  releaseCallRouteLatch,
  resetCallRouteLatchForTests,
  shouldOpenCallRoute,
} from "@/lib/call/routing/call-route-latch";
import { resetDibayCallFlowLogForTests } from "@/lib/call/logging/call-flow-log";

describe("call-route-latch", () => {
  beforeEach(() => {
    resetCallRouteLatchForTests();
    resetDibayCallFlowLogForTests();
  });

  it("blocks duplicate route for same callId", () => {
    const href = "/community-messenger/calls/call-1?action=accept";
    const first = claimCallRouteLatch("call-1", href, "test");
    const second = claimCallRouteLatch("call-1", href, "test");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it("allows shouldOpenCallRoute when latch claimed", () => {
    const href = "/community-messenger/calls/call-2?action=accept";
    claimCallRouteLatch("call-2", href, "test");
    expect(shouldOpenCallRoute(href)).toBe(true);
  });

  it("releases latch for consecutive call after terminal clear", () => {
    const href1 = "/community-messenger/calls/call-3?action=accept";
    const href2 = "/community-messenger/calls/call-4?action=accept";
    claimCallRouteLatch("call-3", href1, "test");
    releaseCallRouteLatch("call-3", "test_end");
    const next = claimCallRouteLatch("call-4", href2, "test");
    expect(next.ok).toBe(true);
  });
});

describe("pending-call-route", () => {
  it("writes and reads pending route from sessionStorage", async () => {
    const { writeCallPendingRoute, readCallPendingRoute, clearCallPendingRoute } = await import(
      "@/lib/call/routing/pending-call-route"
    );
    writeCallPendingRoute("/community-messenger/calls/x?action=accept", "x");
    expect(readCallPendingRoute()?.path).toContain("/community-messenger/calls/x");
    clearCallPendingRoute();
    expect(readCallPendingRoute()).toBeNull();
  });
});
