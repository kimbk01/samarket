import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchSession: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-api", () => ({
  callV3FetchSessionForCallerPoll: apiMocks.fetchSession,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: vi.fn(),
  leaveCallV3Agora: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-agora", () => ({
  joinCallV3Agora: vi.fn(),
  leaveCallV3Agora: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-ringtone", () => ({
  stopCallV3Ringtone: vi.fn(),
  startCallV3Ringtone: vi.fn(),
}));

import {
  readCallV3CallerActivePollCallIdForTests,
  readCallV3CallerStaleOutgoingMsForTests,
  resetCallV3CallerActivePollForTests,
  startCallV3CallerActivePoll,
} from "@/lib/community-messenger/call-v3/call-v3-caller-active";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

function outgoingIdentity(callId: string) {
  return {
    callId,
    roomId: "room-1",
    callerUserId: "a",
    calleeUserId: "b",
    direction: "outgoing" as const,
    mediaType: "audio" as const,
    createdAt: new Date().toISOString(),
  };
}

function pollResult(
  session: { id: string; status: string } | null,
  init?: Partial<{ httpStatus: number; notFound: boolean }>
) {
  return {
    session,
    httpStatus: init?.httpStatus ?? (init?.notFound ? 404 : 200),
    notFound: init?.notFound ?? false,
  };
}

describe("call-v3-caller-active-detection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCallV3CallerActivePollForTests();
    useCallV3Store.getState().resetToIdle();
    apiMocks.fetchSession.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    resetCallV3CallerActivePollForTests();
  });

  it("caller polling detects rejected and route-back", async () => {
    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: outgoingIdentity("call-2"),
      canStartNewCall: false,
    });

    apiMocks.fetchSession.mockResolvedValue(
      pollResult({
        id: "call-2",
        status: "rejected",
      })
    );

    startCallV3CallerActivePoll("call-2");
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canStartNewCall).toBe(true);
    expect(readCallV3CallerActivePollCallIdForTests()).toBeNull();
  });

  it("caller detects active session and moves to joining", async () => {
    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: outgoingIdentity("call-1"),
      canStartNewCall: false,
    });

    apiMocks.fetchSession.mockResolvedValue(
      pollResult({
        id: "call-1",
        status: "active",
      })
    );

    startCallV3CallerActivePoll("call-1");
    expect(readCallV3CallerActivePollCallIdForTests()).toBe("call-1");

    await vi.advanceTimersByTimeAsync(0);
    expect(useCallV3Store.getState().phase).toBe("joining");
  });

  it("caller polling continues while outgoing_ringing", async () => {
    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: outgoingIdentity("call-1"),
    });

    apiMocks.fetchSession.mockResolvedValue(
      pollResult({
        id: "call-1",
        status: "ringing",
      })
    );

    startCallV3CallerActivePoll("call-1");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(apiMocks.fetchSession).toHaveBeenCalledTimes(3);
    expect(readCallV3CallerActivePollCallIdForTests()).toBe("call-1");
    expect(useCallV3Store.getState().phase).toBe("outgoing_ringing");
  });

  it("caller polling does not stop before terminal while status stays ringing", async () => {
    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: outgoingIdentity("call-1"),
    });

    apiMocks.fetchSession
      .mockResolvedValueOnce(pollResult({ id: "call-1", status: "ringing" }))
      .mockResolvedValueOnce(pollResult({ id: "call-1", status: "ringing" }))
      .mockResolvedValueOnce(pollResult({ id: "call-1", status: "rejected" }));

    startCallV3CallerActivePoll("call-1");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(apiMocks.fetchSession).toHaveBeenCalledTimes(3);
    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(readCallV3CallerActivePollCallIdForTests()).toBeNull();
  });

  it("caller polling runs during creating phase", async () => {
    useCallV3Store.setState({
      phase: "creating",
      identity: outgoingIdentity("call-1"),
    });

    apiMocks.fetchSession.mockResolvedValue(
      pollResult({
        id: "call-1",
        status: "ringing",
      })
    );

    startCallV3CallerActivePoll("call-1");
    await vi.advanceTimersByTimeAsync(0);

    expect(apiMocks.fetchSession).toHaveBeenCalledTimes(1);
  });

  it("caller stale or terminal response triggers cleanup on 404", async () => {
    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: outgoingIdentity("call-404"),
      canStartNewCall: false,
    });

    apiMocks.fetchSession.mockResolvedValue(pollResult(null, { notFound: true, httpStatus: 404 }));

    startCallV3CallerActivePoll("call-404");
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(useCallV3Store.getState().phase).toBe("idle");
    expect(useCallV3Store.getState().canStartNewCall).toBe(true);
  });

  it("caller stale timeout triggers cleanup after 45s", async () => {
    const startedAt = new Date("2026-06-23T00:00:00.000Z").toISOString();
    vi.setSystemTime(new Date("2026-06-23T00:00:46.000Z"));

    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: { ...outgoingIdentity("call-age"), createdAt: startedAt },
      canStartNewCall: false,
    });

    startCallV3CallerActivePoll("call-age");
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(readCallV3CallerStaleOutgoingMsForTests()).toBe(45_000);
    expect(apiMocks.fetchSession).not.toHaveBeenCalled();
    expect(useCallV3Store.getState().phase).toBe("idle");
  });

  it("ignores active detection for unrelated phase", async () => {
    useCallV3Store.setState({ phase: "idle" });
    apiMocks.fetchSession.mockResolvedValue(pollResult({ id: "call-1", status: "active" }));

    startCallV3CallerActivePoll("call-1");
    await vi.advanceTimersByTimeAsync(1_000);

    expect(apiMocks.fetchSession).not.toHaveBeenCalled();
    expect(useCallV3Store.getState().phase).toBe("idle");
  });
});
