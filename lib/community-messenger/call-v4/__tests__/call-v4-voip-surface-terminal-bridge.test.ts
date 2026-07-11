/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { shouldSkipIncomingDiscoveryForActiveOutgoing } from "@/lib/community-messenger/call-v4/call-v4-incoming-discovery";
import {
  resolveVoipSurfaceTerminalStatus,
} from "@/lib/community-messenger/call-v4/call-v4-voip-surface-terminal-bridge";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("call-v4 voip surface terminal bridge", () => {
  it("maps ios_voip_terminal reasons to session status", () => {
    expect(resolveVoipSurfaceTerminalStatus("ios_voip_terminal_call_ended")).toBe("ended");
    expect(resolveVoipSurfaceTerminalStatus("ios_voip_terminal_call_rejected")).toBe("rejected");
    expect(resolveVoipSurfaceTerminalStatus("ios_voip_terminal_call_canceled")).toBe("cancelled");
    expect(resolveVoipSurfaceTerminalStatus("ios_callkit_end")).toBeNull();
  });
});

describe("shouldSkipIncomingDiscoveryForActiveOutgoing", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
  });

  it("skips when the same callId is active outgoing ringing", () => {
    useCallV4Store.getState().setIdentity({
      callId: "call-out-1",
      roomId: "room-1",
      callerUserId: "me",
      calleeUserId: "peer",
      direction: "outgoing",
      mediaType: "audio",
      createdAt: new Date().toISOString(),
      peerLabel: "Peer",
      peerAvatarUrl: null,
    });
    useCallV4Store.getState().setPhase("outgoing_ringing");
    expect(shouldSkipIncomingDiscoveryForActiveOutgoing("call-out-1")).toBe(true);
  });

  it("does not skip unrelated incoming discovery callId", () => {
    useCallV4Store.getState().setIdentity({
      callId: "call-out-1",
      roomId: "room-1",
      callerUserId: "me",
      calleeUserId: "peer",
      direction: "outgoing",
      mediaType: "audio",
      createdAt: new Date().toISOString(),
      peerLabel: "Peer",
      peerAvatarUrl: null,
    });
    useCallV4Store.getState().setPhase("outgoing_ringing");
    expect(shouldSkipIncomingDiscoveryForActiveOutgoing("call-in-2")).toBe(false);
  });
});
