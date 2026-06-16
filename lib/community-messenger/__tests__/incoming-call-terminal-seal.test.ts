import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/community-messenger/incoming-call/ring-owner", () => ({
  stopIncomingCallRing: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-orchestrator", () => ({
  logDibayCall: vi.fn(),
}));

import { stopIncomingCallRing } from "@/lib/community-messenger/incoming-call/ring-owner";
import { sealIncomingCallTerminal } from "@/lib/community-messenger/incoming-call/terminal";
import { isDibayCallConsumed } from "@/lib/community-messenger/incoming-call-state";

describe("sealIncomingCallTerminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops ring and latches tombstone for terminal reason", () => {
    const hard = new Map<string, number>();
    const sid = sealIncomingCallTerminal("term-seal-1", "cancelled", hard, "test");
    expect(sid).toBe("term-seal-1");
    expect(stopIncomingCallRing).toHaveBeenCalledWith("terminal_event", "term-seal-1");
    expect(isDibayCallConsumed("term-seal-1")).toBe(true);
    expect(hard.get("term-seal-1")).toBeTypeOf("number");
  });
});
