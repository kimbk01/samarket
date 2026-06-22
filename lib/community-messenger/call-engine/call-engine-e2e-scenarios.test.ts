import { beforeEach, describe, expect, it, vi } from "vitest";
import { dibayIncomingLaneStopRing } from "@/lib/community-messenger/call-lifecycle";
import {
  callEngineAcceptIncoming,
  runCallEnginePatchAction,
} from "@/lib/community-messenger/call-engine/call-engine-actions";
import {
  isCallEngineTerminalConsumed,
  resetCallEngineLocksForTests,
  tryLockCallEngineActionOnce,
} from "@/lib/community-messenger/call-engine/call-engine-locks";
import { resetCallEngineStateForTests } from "@/lib/community-messenger/call-engine/call-engine-state";

const patchCommunityMessengerCallSession = vi.fn();
const markCallConsumed = vi.fn();

vi.mock("@/lib/community-messenger/call-http-actions", () => ({
  patchCommunityMessengerCallSession: (...args: unknown[]) => patchCommunityMessengerCallSession(...args),
}));

vi.mock("@/lib/community-messenger/incoming-call-state", () => ({
  isDibayCallConsumed: () => false,
  markCallConsumed: (...args: unknown[]) => markCallConsumed(...args),
}));

vi.mock("@/lib/community-messenger/call-lifecycle", () => ({
  dibayIncomingLaneStopRing: vi.fn(),
}));

vi.mock("@/lib/push/native/dismiss-native-incoming-call-notification", () => ({
  dismissAllIncomingCallNotificationsFireAndForget: vi.fn(),
}));

describe("call-engine e2e scenarios", () => {
  beforeEach(() => {
    patchCommunityMessengerCallSession.mockReset();
    markCallConsumed.mockReset();
    resetCallEngineLocksForTests();
    resetCallEngineStateForTests();
  });

  it("A: incoming accept is once", async () => {
    patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "c1" } });
    const first = await callEngineAcceptIncoming({ callId: "c1", source: "test" });
    const second = await callEngineAcceptIncoming({ callId: "c1", source: "test" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it("D: reject is once and terminal", async () => {
    patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "c2" } });
    const first = await runCallEnginePatchAction({ callId: "c2", action: "reject", source: "test" });
    const second = await runCallEnginePatchAction({ callId: "c2", action: "reject", source: "test" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(isCallEngineTerminalConsumed("c2")).toBe(true);
    expect(tryLockCallEngineActionOnce("c2", "accept")).toBe(false);
  });

  it("G: ended call does not block new callId", async () => {
    patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "c3" } });
    const ended = await runCallEnginePatchAction({ callId: "c3", action: "end", source: "test" });
    expect(ended.ok).toBe(true);
    patchCommunityMessengerCallSession.mockResolvedValue({ ok: true, session: { id: "c4" } });
    const next = await callEngineAcceptIncoming({ callId: "c4", source: "test" });
    expect(next.ok).toBe(true);
  });

  it("H: terminal reject stops ring before PATCH await", async () => {
    const order: string[] = [];
    vi.mocked(dibayIncomingLaneStopRing).mockImplementation((reason: string) => {
      order.push(`ring:${reason}`);
    });
    patchCommunityMessengerCallSession.mockImplementation(async () => {
      order.push("patch");
      return { ok: true, session: { id: "c-term" } };
    });
    await runCallEnginePatchAction({ callId: "c-term", action: "reject", source: "test" });
    expect(order[0]).toMatch(/^ring:engine_reject_immediate$/);
    expect(order.indexOf("patch")).toBeGreaterThan(0);
  });
});
