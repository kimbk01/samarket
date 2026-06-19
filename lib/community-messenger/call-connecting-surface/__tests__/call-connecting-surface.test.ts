/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearIncomingCallPeerSnapshot,
  readIncomingCallPeerSnapshot,
  writeIncomingCallPeerSnapshot,
} from "@/lib/community-messenger/call-connecting-surface/incoming-call-peer-snapshot";
import {
  getCallConnectingSurfaceState,
  hideCallConnectingSurface,
  requestCallConnectingSurface,
  resetCallConnectingSurfaceForTests,
} from "@/lib/community-messenger/call-connecting-surface/call-connecting-surface-store";

const KEY = "samarket.cm.incoming_call_peer_snapshot.v1";

describe("incoming-call-peer-snapshot", () => {
  afterEach(() => {
    window.sessionStorage.removeItem(KEY);
  });

  it("writes and reads callee peer meta by sessionId", () => {
    writeIncomingCallPeerSnapshot({
      sessionId: "sess-1",
      peerLabel: "Alice",
      peerAvatarUrl: "https://example.com/a.png",
      callKind: "video",
      source: "test",
    });
    expect(readIncomingCallPeerSnapshot("sess-1")).toMatchObject({
      sessionId: "sess-1",
      peerLabel: "Alice",
      peerAvatarUrl: "https://example.com/a.png",
      callKind: "video",
    });
  });

  it("rejects empty peer labels", () => {
    writeIncomingCallPeerSnapshot({ sessionId: "sess-2", peerLabel: "", callKind: "voice" });
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(readIncomingCallPeerSnapshot("sess-2")).toBeNull();
  });

  it("hides surface when duplicate accept claim fails", () => {
    requestCallConnectingSurface("sess-dup", "gateway");
    hideCallConnectingSurface("sess-dup", "duplicate_accept_blocked");
    expect(getCallConnectingSurfaceState()).toBeNull();
  });
});

describe("call-connecting-surface-store", () => {
  afterEach(() => {
    resetCallConnectingSurfaceForTests();
    window.sessionStorage.removeItem(KEY);
  });

  it("shows and hides surface for session", () => {
    requestCallConnectingSurface("sess-1", "gateway");
    expect(getCallConnectingSurfaceState()?.sessionId).toBe("sess-1");
    hideCallConnectingSurface("sess-1", "call_screen_painted");
    expect(getCallConnectingSurfaceState()).toBeNull();
  });
});
