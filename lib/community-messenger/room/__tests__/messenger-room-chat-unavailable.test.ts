import { describe, expect, it } from "vitest";
import { resolveMessengerRoomChatUnavailableReason } from "@/lib/community-messenger/room/messenger-room-chat-unavailable";

const PEER = "peer-1";

function snap(over: {
  room?: Record<string, unknown>;
  members?: Array<{ id: string; blocked?: boolean }>;
  directMessageDenied?: "blocked" | "rejected_by_peer" | null;
  clientShellPlaceholder?: boolean;
}) {
  return {
    room: { peerUserId: PEER, roomStatus: "active", isReadonly: false, deletedAt: null, contextMeta: null, ...over.room },
    members: over.members ?? [{ id: PEER }],
    directMessageDenied: over.directMessageDenied ?? null,
    clientShellPlaceholder: over.clientShellPlaceholder,
  } as any;
}

const resolve = (s: ReturnType<typeof snap>, roomUnavailable = true, tradeOnlyBlocked = false) =>
  resolveMessengerRoomChatUnavailableReason({ snapshot: s, roomUnavailable, tradeOnlyBlocked });

describe("resolveMessengerRoomChatUnavailableReason", () => {
  it("usable room → no bar", () => {
    expect(resolve(snap({}), false)).toBeNull();
  });

  it("trade send block keeps the yellow box → no bar", () => {
    expect(resolve(snap({}), true, true)).toBeNull();
  });

  it("client shell placeholder → no bar", () => {
    expect(resolve(snap({ directMessageDenied: "blocked", clientShellPlaceholder: true }))).toBeNull();
  });

  it("I blocked the peer → blocked_by_me", () => {
    expect(resolve(snap({ directMessageDenied: "blocked", members: [{ id: PEER, blocked: true }] }))).toBe(
      "blocked_by_me"
    );
  });

  it("peer blocked me → blocked_by_peer (no reason line)", () => {
    expect(resolve(snap({ directMessageDenied: "blocked" }))).toBe("blocked_by_peer");
  });

  it("friend request rejected → rejected_by_peer", () => {
    expect(resolve(snap({ directMessageDenied: "rejected_by_peer" }))).toBe("rejected_by_peer");
  });

  it("completed / cancelled store order → store_order_closed (even in delivery rooms)", () => {
    expect(resolve(snap({ room: { contextMeta: { kind: "delivery", orderStatus: "completed" } } }))).toBe(
      "store_order_closed"
    );
  });

  it("room status reasons", () => {
    expect(resolve(snap({ room: { isReadonly: true } }))).toBe("readonly");
    expect(resolve(snap({ room: { roomStatus: "blocked" } }))).toBe("room_blocked");
    expect(resolve(snap({ room: { roomStatus: "archived" } }))).toBe("archived");
    expect(resolve(snap({ room: { deletedAt: "2026-11-01T00:00:00Z" } }))).toBe("archived");
  });
});
