import { beforeEach, describe, expect, it, vi } from "vitest";
import { markCallConsumed } from "@/lib/community-messenger/incoming-call-state";
import { markCallEngineTerminalConsumed, resetCallEngineLocksForTests } from "@/lib/community-messenger/call-engine/call-engine-locks";
import { resetCallEngineStateForTests, setCallEngineState } from "@/lib/community-messenger/call-engine/call-engine-state";
import { prepareCallEngineForFreshIncomingRing } from "@/lib/community-messenger/call-engine/call-engine-fresh-ring-reset";
import { isDibayCallConsumed } from "@/lib/community-messenger/incoming-call-state";

describe("call-engine-fresh-ring-reset", () => {
  beforeEach(() => {
    resetCallEngineLocksForTests();
    resetCallEngineStateForTests();
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
  });

  it("clears terminal latch so a new ringing cycle can accept", () => {
    markCallEngineTerminalConsumed("call-2");
    markCallConsumed("call-2", "cancelled");
    expect(isDibayCallConsumed("call-2")).toBe(true);

    expect(prepareCallEngineForFreshIncomingRing("call-2")).toBe(true);
    expect(isDibayCallConsumed("call-2")).toBe(false);
  });

  it("does not clear terminal latch without consumed reason (missed notification reopen)", () => {
    markCallEngineTerminalConsumed("call-missed");
    expect(prepareCallEngineForFreshIncomingRing("call-missed")).toBe(false);
  });

  it("does not reset while accept is in flight", () => {
    markCallConsumed("call-3", "accepted");
    setCallEngineState("call-3", "accepting");

    expect(prepareCallEngineForFreshIncomingRing("call-3")).toBe(false);
    expect(isDibayCallConsumed("call-3")).toBe(true);
  });
});
