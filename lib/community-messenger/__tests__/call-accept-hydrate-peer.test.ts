/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCalleeAcceptActiveSessionSeed,
  CALL_ACCEPT_HYDRATE_PEER_KEY,
  clearCallAcceptHydratePeer,
  hasCallAcceptHydratePeerLabel,
  readCallAcceptHydratePeer,
  writeCallAcceptHydratePeer,
} from "@/lib/community-messenger/call-accept-hydrate-peer";

describe("call-accept-hydrate-peer", () => {
  afterEach(() => {
    window.sessionStorage.removeItem(CALL_ACCEPT_HYDRATE_PEER_KEY);
  });

  it("writes and reads callee peer meta by sessionId", () => {
    writeCallAcceptHydratePeer({
      sessionId: "sess-1",
      peerLabel: "Alice",
      peerAvatarUrl: "https://example.com/a.png",
      callKind: "video",
      roomId: "room-1",
      peerUserId: "user-1",
      source: "test",
    });
    expect(readCallAcceptHydratePeer("sess-1")).toMatchObject({
      sessionId: "sess-1",
      peerLabel: "Alice",
      peerAvatarUrl: "https://example.com/a.png",
      callKind: "video",
    });
  });

  it("stores hydrate peer without peerLabel for skeleton first paint", () => {
    writeCallAcceptHydratePeer({ sessionId: "sess-no-label", peerLabel: "", callKind: "voice" });
    const raw = window.sessionStorage.getItem(CALL_ACCEPT_HYDRATE_PEER_KEY);
    expect(raw).toContain("sess-no-label");
    const peer = readCallAcceptHydratePeer("sess-no-label");
    expect(peer?.sessionId).toBe("sess-no-label");
    expect(hasCallAcceptHydratePeerLabel(peer)).toBe(false);
    clearCallAcceptHydratePeer("sess-no-label");
  });

  it("builds active callee navigation seed from hydrate peer", () => {
    const peer = {
      sessionId: "sess-2",
      peerLabel: "Bob",
      peerAvatarUrl: null,
      callKind: "voice" as const,
      at: Date.now(),
    };
    const seed = buildCalleeAcceptActiveSessionSeed(peer);
    expect(seed.status).toBe("active");
    expect(seed.isMineInitiator).toBe(false);
    expect(seed.peerLabel).toBe("Bob");
  });
});
