import { beforeEach, describe, expect, it, vi } from "vitest";
import { endNativeCallService } from "@/lib/call/native/native-call-service";
import { runCallEndGuardFromAppSwipe } from "@/lib/call/actions/call-end-guard";

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  patchCommunityMessengerCallSession: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  endNativeCallService: vi.fn(async () => true),
  prepareNativeCallAccept: vi.fn(async () => true),
  startNativeCallService: vi.fn(async () => true),
  readNativeActiveCallId: vi.fn(async () => "call-swipe-1"),
}));

vi.mock("@/lib/community-messenger/call-lifecycle", () => ({
  dibayCallSealTerminal: vi.fn(),
  dibayIncomingLaneStopRing: vi.fn(),
}));

import { resetCallEngineForTest } from "@/lib/community-messenger/call-engine";
import { patchCommunityMessengerCallSession } from "@/lib/community-messenger/call-http-actions";

describe("call-end-guard swipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallEngineForTest();
  });

  it("still supports explicit swipe end patch when invoked", async () => {
    await runCallEndGuardFromAppSwipe("call-swipe-1", "app_swipe");
    expect(patchCommunityMessengerCallSession).toHaveBeenCalledWith(
      "call-swipe-1",
      "end",
      expect.objectContaining({ clientEndedReason: "app_swipe" }),
      undefined,
    );
    expect(endNativeCallService).not.toHaveBeenCalled();
  });
});

describe("native-call-service singleton", () => {
  it("exposes endCall API", async () => {
    vi.mocked(endNativeCallService).mockResolvedValueOnce(true);
    const ok = await endNativeCallService("call-1", "test");
    expect(ok).toBe(true);
  });
});
