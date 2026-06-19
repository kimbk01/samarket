import { describe, expect, it } from "vitest";
import { resolveCallLogDisplayPeerUserId } from "@/lib/community-messenger/call-history/call-log-display-peer";

describe("resolveCallLogDisplayPeerUserId", () => {
  const viewer = "viewer-1";
  const caller = "caller-2";
  const peer = "peer-3";

  it("prefers stored peer when it is not the viewer", () => {
    expect(
      resolveCallLogDisplayPeerUserId(viewer, {
        callerUserId: viewer,
        peerUserId: peer,
      })
    ).toBe(peer);
  });

  it("uses caller when stored peer equals viewer (incoming recipient row)", () => {
    expect(
      resolveCallLogDisplayPeerUserId(viewer, {
        callerUserId: caller,
        peerUserId: viewer,
      })
    ).toBe(caller);
  });

  it("falls back to session initiator/recipient when row ids are both viewer", () => {
    expect(
      resolveCallLogDisplayPeerUserId(viewer, {
        callerUserId: viewer,
        peerUserId: viewer,
      }, {
        session: { initiatorUserId: caller, recipientUserId: viewer },
      })
    ).toBe(caller);
  });

  it("uses direct room peer hint when row ids are missing", () => {
    expect(
      resolveCallLogDisplayPeerUserId(viewer, {
        callerUserId: null,
        peerUserId: null,
      }, {
        roomPeerUserId: peer,
      })
    ).toBe(peer);
  });
});
