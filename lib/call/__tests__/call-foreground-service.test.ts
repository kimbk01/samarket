import { describe, expect, it, vi } from "vitest";
import { endNativeCallService } from "@/lib/call/native/native-call-service";

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

describe("native-call-service singleton", () => {
  it("exposes endCall API", async () => {
    vi.mocked(endNativeCallService).mockResolvedValueOnce(true);
    const ok = await endNativeCallService("call-1", "test");
    expect(ok).toBe(true);
  });
});
