/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCalleeAcceptActiveSessionSeed,
  clearCallAcceptHydratePeer,
  readCallAcceptHydratePeer,
  writeCallAcceptHydratePeer,
} from "@/lib/community-messenger/call-accept-hydrate-peer";

const KEY = "samarket.cm.call_accept_hydrate_peer.v1";

describe("call-accept-hydrate-peer", () => {
  afterEach(() => {
    window.sessionStorage.removeItem(KEY);
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

  it("skips empty peer labels", () => {
    writeCallAcceptHydratePeer({ sessionId: "sess-3", peerLabel: "" });
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    clearCallAcceptHydratePeer("sess-3");
  });
});
