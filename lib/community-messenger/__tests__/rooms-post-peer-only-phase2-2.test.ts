import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isGeneralFriendDirectRoom,
  isMessengerGeneralFriendDirectKey,
  messengerDirectKeyForUserPair,
} from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const root = join(process.cwd());

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function roomSummary(partial: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id">): CommunityMessengerRoomSummary {
  return {
    id: partial.id,
    roomType: partial.roomType ?? "direct",
    roomStatus: partial.roomStatus ?? "active",
    title: partial.title ?? "",
    summary: partial.summary ?? "",
    subtitle: partial.subtitle ?? "",
    avatarUrl: partial.avatarUrl ?? null,
    lastMessage: partial.lastMessage ?? "",
    lastMessageAt: partial.lastMessageAt ?? "2026-01-01T00:00:00.000Z",
    lastMessageType: partial.lastMessageType ?? "text",
    unreadCount: partial.unreadCount ?? 0,
    isMuted: partial.isMuted ?? false,
    isPinned: partial.isPinned ?? false,
    isArchivedByViewer: partial.isArchivedByViewer ?? false,
    peerUserId: partial.peerUserId ?? null,
    memberCount: partial.memberCount ?? 2,
    messengerDirectKey: partial.messengerDirectKey ?? null,
    contextMeta: partial.contextMeta ?? null,
  } as CommunityMessengerRoomSummary;
}

describe("POST /api/community-messenger/rooms — Phase 2-2 peer-only contract", () => {
  const routeSrc = read("app/api/community-messenger/rooms/route.ts");

  it("peer-only branch uses ensureGeneralFriendDirectRoom (not ensureCommunityMessengerDirectRoom)", () => {
    expect(routeSrc).toContain("ensureGeneralFriendDirectRoom");
    expect(routeSrc).not.toContain("ensureCommunityMessengerDirectRoom(");
  });

  it("peer-only snapshot is gated by isGeneralFriendDirectRoom", () => {
    expect(routeSrc).toContain("isGeneralFriendDirectRoom");
    expect(routeSrc).toContain("isPeerOnlyDirect");
    expect(routeSrc).toContain('jsonError("cannot_start_chat", 403');
  });

  it("store_order and productChat paths are unchanged", () => {
    expect(routeSrc).toContain("ensureCommunityMessengerDirectRoomFromStoreOrderChat");
    expect(routeSrc).toContain("ensureCommunityMessengerDirectRoomFromProductChat");
    const postDirectBlock = routeSrc.slice(routeSrc.indexOf("const isPeerOnlyDirect"));
    expect(postDirectBlock).not.toContain("isGeneralFriendDirectRoom(snapshot.room)) && storeOrderId");
  });

  it("call-v3 peer ensure still targets peer-only POST body", () => {
    const callV3 = read("lib/community-messenger/call-v3/call-v3-api.ts");
    expect(callV3).toContain('fetch("/api/community-messenger/rooms"');
    expect(callV3).toContain("roomType: \"direct\", peerUserId");
  });

  it("group member → 1:1 uses peer-only POST", () => {
    const controller = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    expect(controller).toContain('fetch("/api/community-messenger/rooms"');
    expect(controller).toContain("roomType: \"direct\", peerUserId");
  });
});

describe("peer-only general_friend_dm snapshot gate — domain scenarios", () => {
  const userA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const userB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const pairKey = messengerDirectKeyForUserPair(userA, userB);

  it("1) A-B trade history pair key → general_friend_dm", () => {
    const room = roomSummary({
      id: "room-general",
      peerUserId: userB,
      messengerDirectKey: pairKey,
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1", headline: "거래" },
    });
    expect(isMessengerGeneralFriendDirectKey(pairKey)).toBe(true);
    expect(isGeneralFriendDirectRoom(room)).toBe(true);
  });

  it("2) legacy summary trade meta on basePairKey → still general_friend_dm", () => {
    const room = roomSummary({
      id: "room-legacy-meta",
      peerUserId: userB,
      messengerDirectKey: pairKey,
      summary: JSON.stringify({ kind: "trade", productChatId: "pc-old" }),
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-old", headline: "legacy" },
    });
    expect(isGeneralFriendDirectRoom(room)).toBe(true);
  });

  it("3) trade_pc direct key is not general (commerce path unchanged)", () => {
    const tradeKey = "trade_pc:product-chat-1";
    const room = roomSummary({
      id: "room-trade",
      peerUserId: userB,
      messengerDirectKey: tradeKey,
      contextMeta: { v: 1, kind: "trade", productChatId: "product-chat-1", headline: "item" },
    });
    expect(isGeneralFriendDirectRoom(room)).toBe(false);
    expect(isMessengerGeneralFriendDirectKey(tradeKey)).toBe(false);
  });

  it("store_order direct key is not general", () => {
    const orderKey = "store_order:order-1";
    const room = roomSummary({
      id: "room-order",
      peerUserId: userB,
      messengerDirectKey: orderKey,
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "order-1", headline: "order" },
    });
    expect(isGeneralFriendDirectRoom(room)).toBe(false);
  });
});
