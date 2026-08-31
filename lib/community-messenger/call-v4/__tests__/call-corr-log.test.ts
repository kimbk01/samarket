import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logCallCorr } from "@/lib/community-messenger/call-v4/call-v4-debug";

describe("logCallCorr evidence markers", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("emits DIBAY_CALL_CORR with marker callId wall_ms", () => {
    logCallCorr("A0", { callId: "sess-1", stage: "outgoing_tap" });
    expect(spy).toHaveBeenCalled();
    const [tag, payload] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(tag).toBe("[DIBAY_CALL_CORR]");
    expect(payload.marker).toBe("A0");
    expect(payload.callId).toBe("sess-1");
    expect(typeof payload.wall_ms).toBe("number");
    expect(payload.stage).toBe("outgoing_tap");
  });
});
