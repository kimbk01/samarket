import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSessionForPoll: vi.fn(),
  subscribeInvite: vi.fn(),
  removeChannel: vi.fn(),
  isNativeOwned: vi.fn(async () => true),
  activeCallId: vi.fn(async (): Promise<string | null> => null),
  shell: null as "ios" | "android" | null,
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  readNativeActiveCallId: () => mocks.activeCallId(),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  resolveCapacitorShellPlatform: () => mocks.shell,
}));

vi.mock("@/lib/call/native/native-outgoing-bridge", () => ({
  isNativeEstablishmentOwned: (...args: unknown[]) => mocks.isNativeOwned(...args),
}));

vi.mock("@/lib/call/native/call-heartbeat-watchdog", () => ({
  CALL_HEARTBEAT_INTERVAL_MS: 10_000,
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchSessionForCallerPoll: (...args: unknown[]) => mocks.fetchSessionForPoll(...args),
}));

vi.mock("@/lib/community-messenger/call-invite-realtime-broadcast", () => ({
  subscribeCommunityMessengerCallInviteBroadcast: (...args: unknown[]) => mocks.subscribeInvite(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ removeChannel: mocks.removeChannel }),
}));

import {
  registerCallV4ConnectedTerminalHandler,
  resetCallV4ConnectedTerminalWatchForTests,
  startCallV4ConnectedTerminalWatch,
  startCallV4TerminalRealtimeWatch,
  triggerCallV4RemoteTerminalCheckFromAgora,
} from "@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

function seedConnectedCall(callId = "call-watch") {
  useCallV4Store.getState().resetToIdle();
  useCallV4Store.getState().setIdentity({
    callId,
    roomId: "room-1",
    callerUserId: "u-a",
    calleeUserId: "u-b",
    direction: "incoming",
    mediaType: "audio",
    createdAt: new Date().toISOString(),
  });
  useCallV4Store.setState({ phase: "connected", connectedAt: Date.now() });
}

describe("call-v4 connected terminal watch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.fetchSessionForPoll.mockReset();
    mocks.subscribeInvite.mockReset();
    mocks.removeChannel.mockReset();
    mocks.isNativeOwned.mockReset();
    mocks.isNativeOwned.mockResolvedValue(true);
    mocks.activeCallId.mockReset();
    mocks.activeCallId.mockResolvedValue(null);
    mocks.shell = null;
    resetCallV4ConnectedTerminalWatchForTests();
    seedConnectedCall();
  });

  afterEach(() => {
    resetCallV4ConnectedTerminalWatchForTests();
    vi.useRealTimers();
  });

  it("poll confirms terminal status and calls registered handler", async () => {
    const handler = vi.fn();
    registerCallV4ConnectedTerminalHandler(handler);
    mocks.fetchSessionForPoll.mockResolvedValue({
      session: { status: "ended" },
      httpStatus: 200,
      notFound: false,
    });
    startCallV4ConnectedTerminalWatch("call-watch");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(handler).toHaveBeenCalledWith("call-watch", "ended", "poll");
  });

  it("agora remote-left trigger verifies server terminal before finalize", async () => {
    const handler = vi.fn();
    registerCallV4ConnectedTerminalHandler(handler);
    mocks.fetchSessionForPoll.mockResolvedValue({
      session: { status: "cancelled" },
      httpStatus: 200,
      notFound: false,
    });
    startCallV4ConnectedTerminalWatch("call-watch");
    triggerCallV4RemoteTerminalCheckFromAgora("call-watch", 7);
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith("call-watch", "cancelled", "agora");
  });

  it("realtime subscription routes hangup payload into terminal confirmation", async () => {
    const handler = vi.fn();
    registerCallV4ConnectedTerminalHandler(handler);
    mocks.fetchSessionForPoll.mockResolvedValue({
      session: { status: "rejected" },
      httpStatus: 200,
      notFound: false,
    });
    const channel = { id: "ch" };
    mocks.subscribeInvite.mockImplementation((_sb, _userId, handlers) => {
      handlers.onHangup({ sessionId: "call-watch", status: "rejected" });
      return channel;
    });
    startCallV4ConnectedTerminalWatch("call-watch");
    const cleanup = startCallV4TerminalRealtimeWatch("u-b");
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith("call-watch", "rejected", "realtime");
    cleanup();
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("ignores non-current call terminal triggers", async () => {
    const handler = vi.fn();
    registerCallV4ConnectedTerminalHandler(handler);
    mocks.fetchSessionForPoll.mockResolvedValue({
      session: { status: "ended" },
      httpStatus: 200,
      notFound: false,
    });
    startCallV4ConnectedTerminalWatch("call-watch");
    triggerCallV4RemoteTerminalCheckFromAgora("other-call", 8);
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });

  describe("R3-b native-owned connected call", () => {
    const ringing = { session: { status: "active" }, httpStatus: 200, notFound: false };

    function subscribeRealtime(status: string) {
      let onStatus: ((s: string) => void) | undefined;
      mocks.subscribeInvite.mockImplementation((_sb: unknown, _uid: unknown, handlers: { onStatus?: (s: string) => void }) => {
        onStatus = handlers.onStatus;
        return {};
      });
      startCallV4TerminalRealtimeWatch("u-b");
      onStatus?.(status);
    }

    it("no session GET while native owns the call and the hangup channel is subscribed", async () => {
      subscribeRealtime("SUBSCRIBED");
      mocks.fetchSessionForPoll.mockResolvedValue(ringing);
      startCallV4ConnectedTerminalWatch("call-watch", { nativeOwned: true });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mocks.isNativeOwned).toHaveBeenCalled();
      expect(mocks.fetchSessionForPoll).not.toHaveBeenCalled();
    });

    it("falls back to one GET per heartbeat interval while the hangup channel is down", async () => {
      subscribeRealtime("CHANNEL_ERROR");
      mocks.fetchSessionForPoll.mockResolvedValue(ringing);
      startCallV4ConnectedTerminalWatch("call-watch", { nativeOwned: true });
      await vi.advanceTimersByTimeAsync(9_000);
      expect(mocks.fetchSessionForPoll).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(mocks.fetchSessionForPoll).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mocks.fetchSessionForPoll).toHaveBeenCalledTimes(2);
    });

    it("confirms once and finalizes when native releases the call", async () => {
      subscribeRealtime("SUBSCRIBED");
      const handler = vi.fn();
      registerCallV4ConnectedTerminalHandler(handler);
      mocks.fetchSessionForPoll.mockResolvedValue({ session: { status: "ended" }, httpStatus: 200, notFound: false });
      startCallV4ConnectedTerminalWatch("call-watch", { nativeOwned: true });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(mocks.fetchSessionForPoll).not.toHaveBeenCalled();
      mocks.isNativeOwned.mockResolvedValue(false);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mocks.fetchSessionForPoll).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("call-watch", "ended", "native_released");
    });

    it("web-established call keeps the 1s server poll", async () => {
      subscribeRealtime("SUBSCRIBED");
      mocks.fetchSessionForPoll.mockResolvedValue(ringing);
      startCallV4ConnectedTerminalWatch("call-watch");
      await vi.advanceTimersByTimeAsync(3_000);
      expect(mocks.fetchSessionForPoll).toHaveBeenCalledTimes(3);
      expect(mocks.isNativeOwned).not.toHaveBeenCalled();
    });

    it("iOS voice incoming without owner claim: active runtime call counts as native-held", async () => {
      subscribeRealtime("SUBSCRIBED");
      mocks.shell = "ios";
      mocks.isNativeOwned.mockResolvedValue(false);
      mocks.activeCallId.mockResolvedValue("call-watch");
      mocks.fetchSessionForPoll.mockResolvedValue(ringing);
      startCallV4ConnectedTerminalWatch("call-watch", { nativeOwned: true });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(mocks.fetchSessionForPoll).not.toHaveBeenCalled();

      mocks.activeCallId.mockResolvedValue(null);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mocks.fetchSessionForPoll).toHaveBeenCalledTimes(1);
    });

    it("Android: active-call id is not consulted once the owner is released", async () => {
      subscribeRealtime("SUBSCRIBED");
      mocks.shell = "android";
      mocks.isNativeOwned.mockResolvedValue(false);
      mocks.activeCallId.mockResolvedValue("call-watch");
      mocks.fetchSessionForPoll.mockResolvedValue({ session: { status: "ended" }, httpStatus: 200, notFound: false });
      startCallV4ConnectedTerminalWatch("call-watch", { nativeOwned: true });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mocks.activeCallId).not.toHaveBeenCalled();
      expect(mocks.fetchSessionForPoll).toHaveBeenCalledTimes(1);
    });
  });
});
