import { beforeEach, describe, expect, it, vi } from "vitest";

const warmMocks = vi.hoisted(() => ({
  prime: vi.fn(),
  clear: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-connection-prefetch", () => ({
  primeCommunityMessengerCallConnectionPrefetch: warmMocks.prime,
  clearCommunityMessengerCallConnectionPrefetch: warmMocks.clear,
  resolveCommunityMessengerCallConnection: warmMocks.resolve,
}));

import { callV4IncomingDiscovered } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { buildCallV4ScreenHref } from "@/lib/community-messenger/call-v4/call-v4-route";
import { primeCallV4ConnectionWarm } from "@/lib/community-messenger/call-v4/call-v4-connection-warm";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function ringingSession(callId: string): CommunityMessengerCallSession {
  return {
    id: callId,
    roomId: "room-1",
    status: "ringing",
    isMineInitiator: false,
    initiatorUserId: "caller",
    recipientUserId: "callee",
    peerUserId: "caller",
    peerLabel: "Caller",
    callKind: "voice",
    startedAt: new Date().toISOString(),
  } as CommunityMessengerCallSession;
}

describe("call-v4 callee telegram warm path", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    warmMocks.prime.mockReset();
    warmMocks.clear.mockReset();
    warmMocks.resolve.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("warms connection when incoming session is discovered", () => {
    callV4IncomingDiscovered(ringingSession("call-warm"));
    expect(warmMocks.prime).toHaveBeenCalledWith("call-warm");
    expect(useCallV4Store.getState().phase).toBe("incoming_ringing");
  });

  it("sheet accept routes to call screen without action=accept (single accept owner)", () => {
    const href = buildCallV4ScreenHref("call-route", "sheet");
    expect(href).toBe("/community-messenger/calls-v4/call-route?source=sheet");
    expect(href).not.toContain("action=accept");
  });

  it("primeCallV4ConnectionWarm delegates to shared prefetch", () => {
    primeCallV4ConnectionWarm("call-1");
    expect(warmMocks.prime).toHaveBeenCalledWith("call-1");
  });

  it("blocks duplicate incoming sheet for the same callId while incoming_ringing", () => {
    const info = vi.spyOn(console, "info");
    const session = ringingSession("call-dup");
    callV4IncomingDiscovered(session);
    callV4IncomingDiscovered(session);
    const duplicateLog = info.mock.calls.find((call) => call[1] === "incoming_surface_duplicate_blocked");
    expect(duplicateLog).toBeDefined();
    expect(useCallV4Store.getState().phase).toBe("incoming_ringing");
  });
});
