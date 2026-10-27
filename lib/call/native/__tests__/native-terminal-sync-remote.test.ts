import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSessionForCallerPoll: vi.fn(),
  handleRemoteTerminal: vi.fn(async () => undefined),
  cleanup: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchSessionForCallerPoll: mocks.fetchSessionForCallerPoll,
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({
  callV4HandleRemoteTerminal: mocks.handleRemoteTerminal,
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-cleanup", () => ({
  cleanupCallV4: mocks.cleanup,
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  NATIVE_CALL_TERMINAL_EVENT: "nativeCallTerminal",
  endNativeCallService: vi.fn(async () => true),
  nativeCallServicePlugin: { addListener: vi.fn() },
}));

vi.mock("@/lib/call/native/native-outgoing-bridge", () => ({
  isNativeEstablishmentOwned: vi.fn(async () => false),
}));

import { onNativeCallLocalTerminal } from "@/lib/call/native/native-terminal-sync";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

function setRinging(callId: string, direction: "outgoing" | "incoming") {
  useCallV4Store.setState({
    phase: direction === "outgoing" ? "outgoing_ringing" : "incoming_ringing",
    canStartNewCall: false,
    identity: {
      callId,
      roomId: "room-1",
      callerUserId: "",
      calleeUserId: "peer-1",
      direction,
      mediaType: "video",
      createdAt: new Date().toISOString(),
      peerLabel: "Peer",
      peerAvatarUrl: null,
    },
  });
}

describe("onNativeCallLocalTerminal — native remote terminal on outgoing", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    mocks.fetchSessionForCallerPoll.mockReset();
    mocks.handleRemoteTerminal.mockClear();
    mocks.cleanup.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("finalizes through callV4HandleRemoteTerminal with the server status (reject notice path)", async () => {
    setRinging("call-remote-1", "outgoing");
    mocks.fetchSessionForCallerPoll.mockResolvedValue({
      session: { id: "call-remote-1", status: "rejected" },
      httpStatus: 200,
      notFound: false,
    });

    await onNativeCallLocalTerminal({
      callId: "call-remote-1",
      reason: "remote_ended",
      source: "remote_terminal",
      nativeOwned: true,
    });

    expect(mocks.handleRemoteTerminal).toHaveBeenCalledWith(
      "call-remote-1",
      "rejected",
      undefined,
      "native_remote_terminal",
    );
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("falls back to immediate idle when the server does not confirm a terminal status", async () => {
    setRinging("call-remote-2", "outgoing");
    mocks.fetchSessionForCallerPoll.mockResolvedValue({ session: null, httpStatus: 0, notFound: false });

    await onNativeCallLocalTerminal({
      callId: "call-remote-2",
      reason: "remote_ended",
      source: "remote_terminal",
      nativeOwned: true,
    });

    expect(mocks.handleRemoteTerminal).not.toHaveBeenCalled();
    expect(useCallV4Store.getState().phase).toBe("idle");
    expect(mocks.cleanup).toHaveBeenCalledWith("call-remote-2", "ended", { nativeAlreadyTerminal: true });
  });

  it("keeps local end (user hang-up) as immediate idle without a server read", async () => {
    setRinging("call-local-1", "outgoing");

    await onNativeCallLocalTerminal({
      callId: "call-local-1",
      reason: "ended",
      source: "local_end",
      nativeOwned: true,
    });

    expect(mocks.fetchSessionForCallerPoll).not.toHaveBeenCalled();
    expect(mocks.handleRemoteTerminal).not.toHaveBeenCalled();
    expect(useCallV4Store.getState().phase).toBe("idle");
  });

  it("A-10: iPhone 직접 끊기(local_end_begin) 정리는 네이티브로 종료를 되돌려 보내지 않는다", async () => {
    setRinging("call-local-begin", "incoming");

    await onNativeCallLocalTerminal({
      callId: "call-local-begin",
      reason: "ended",
      source: "local_end_begin",
      nativeOwned: true,
    });

    expect(useCallV4Store.getState().phase).toBe("idle");
    expect(mocks.cleanup).toHaveBeenCalledWith("call-local-begin", "ended", { nativeAlreadyTerminal: true });
  });

  it("keeps incoming remote terminal unchanged (no server read)", async () => {
    setRinging("call-in-1", "incoming");

    await onNativeCallLocalTerminal({
      callId: "call-in-1",
      reason: "remote_ended",
      source: "remote_terminal",
      nativeOwned: true,
    });

    expect(mocks.fetchSessionForCallerPoll).not.toHaveBeenCalled();
    expect(mocks.handleRemoteTerminal).not.toHaveBeenCalled();
  });
});
