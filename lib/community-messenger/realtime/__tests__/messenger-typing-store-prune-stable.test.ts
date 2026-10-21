import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  pruneExpiredTypingState,
  resetMessengerTypingStore,
  selectTypingPeerIdsKey,
  TYPING_PEER_IDS_KEY_SEPARATOR,
  useMessengerTypingStore,
} from "@/lib/community-messenger/stores/useMessengerTypingStore";

const ROOM = "room-a";

beforeEach(() => {
  resetMessengerTypingStore();
});

describe("P-1 typing store — unchanged prune keeps the same state object", () => {
  it("clearExpired with nothing expired does not notify subscribers", () => {
    useMessengerTypingStore.getState().setTyping(ROOM, "u1", 10_000);
    const before = useMessengerTypingStore.getState();
    let notified = 0;
    const unsub = useMessengerTypingStore.subscribe(() => {
      notified += 1;
    });
    useMessengerTypingStore.getState().clearExpired(Date.now());
    useMessengerTypingStore.getState().clearExpired(Date.now() + 1);
    unsub();
    expect(notified).toBe(0);
    expect(useMessengerTypingStore.getState()).toBe(before);
    expect(useMessengerTypingStore.getState().byRoomId).toBe(before.byRoomId);
  });

  it("empty store prune returns the same object", () => {
    const state = { byRoomId: {} };
    expect(pruneExpiredTypingState(state, Date.now())).toBe(state);
  });

  it("expired entries are removed; untouched rooms keep their bucket reference", () => {
    const keep = { u9: { roomId: "room-b", userId: "u9", expiresAt: 5_000 } };
    const state = {
      byRoomId: {
        [ROOM]: {
          u1: { roomId: ROOM, userId: "u1", expiresAt: 5_000 },
          u2: { roomId: ROOM, userId: "u2", expiresAt: 500 },
          u3: { roomId: ROOM, userId: "u3", expiresAt: 6_000 },
        },
        "room-b": keep,
      },
    };
    const next = pruneExpiredTypingState(state, 1_000);
    expect(next).not.toBe(state);
    expect(Object.keys(next.byRoomId[ROOM]!)).toEqual(["u1", "u3"]);
    expect(next.byRoomId["room-b"]).toBe(keep);
  });

  it("clearTyping for an absent user is a no-op (same state)", () => {
    const before = useMessengerTypingStore.getState();
    useMessengerTypingStore.getState().clearTyping(ROOM, "nobody");
    expect(useMessengerTypingStore.getState()).toBe(before);
  });
});

describe("P-1 selectTypingPeerIdsKey — primitive per-room selector", () => {
  const byRoomId = {
    [ROOM]: {
      viewer: { roomId: ROOM, userId: "viewer", expiresAt: 9_000 },
      p1: { roomId: ROOM, userId: "p1", expiresAt: 9_000 },
      p2: { roomId: ROOM, userId: "p2", expiresAt: 100 },
      p3: { roomId: ROOM, userId: "p3", expiresAt: 9_000 },
    },
  };

  it("group: excludes viewer and expired, joins ids", () => {
    expect(selectTypingPeerIdsKey(byRoomId, { roomId: "ROOM-A", viewerUserId: "viewer", now: 1_000 })).toBe(
      ["p1", "p3"].join(TYPING_PEER_IDS_KEY_SEPARATOR)
    );
  });

  it("direct: only the peer", () => {
    expect(selectTypingPeerIdsKey(byRoomId, { roomId: ROOM, viewerUserId: "viewer", peerUserId: "p3", now: 1_000 })).toBe("p3");
    expect(selectTypingPeerIdsKey(byRoomId, { roomId: ROOM, viewerUserId: "viewer", peerUserId: "p2", now: 1_000 })).toBe("");
  });

  it("other rooms changing never changes this room's key", () => {
    const a = selectTypingPeerIdsKey(byRoomId, { roomId: ROOM, viewerUserId: "viewer", now: 1_000 });
    const b = selectTypingPeerIdsKey(
      { ...byRoomId, other: { x: { roomId: "other", userId: "x", expiresAt: 9_000 } } },
      { roomId: ROOM, viewerUserId: "viewer", now: 1_000 }
    );
    expect(b).toBe(a);
  });
});

describe("P-1 timeline subscribes only to the current room key", () => {
  it("does not subscribe to the whole byRoomId map", () => {
    const src = readFileSync(
      join(process.cwd(), "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/useMessengerTypingStore\(\(state\) => state\.byRoomId\)/);
    expect(src).toContain("selectTypingPeerIdsKey(state.byRoomId");
  });
});
