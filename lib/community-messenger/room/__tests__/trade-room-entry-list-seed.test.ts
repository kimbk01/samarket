/**
 * 거래방 진입 감사 (docs/audit/trade-room-entry-seed-audit-design-2026-11-16.md) — PR 1 계약.
 * S1 목록 시드 값 · S2 목록 요약이 서버 방 데이터를 덮지 않음 · S3 목록 시드는 「최신」이 아님 + 서버 병합 시 표시 해제.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllRoomSnapshotCaches,
  getRoomSnapshotCacheAgeMs,
  isRoomSnapshotCurrentForListActivity,
  isRoomSnapshotFreshWithin,
  peekHotRoomSnapshot,
  peekRoomSnapshot,
  primeRoomSnapshot,
  seedRoomSnapshotFromSummary,
} from "@/lib/community-messenger/room-snapshot-cache";
import { domainTradeListRowToUnifiedItem } from "@/components/community-messenger/domain-shell-canary/domain-trade-list-row-to-unified-item";
import { messengerTradeViewerRoleFromContextMeta } from "@/lib/community-messenger/messenger-trade-viewer-role";
import { mergeCommunityMessengerForegroundBootstrapIntoSnapshot } from "@/lib/community-messenger/room/merge-community-messenger-foreground-bootstrap";
import { pickRichestAuthoritativeRoomSnapshot } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

const VIEWER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const BUYER = "0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc";
const ROOM = "33a8f97f-ec41-43f7-bb6e-2b666f647830";
const POST = "227dcf5b-9d88-4417-8f78-b9e721824ed3";
const PCID = "f2259da3-66cf-4e78-990b-dd9236f222c2";
const SERVER_KEY = "trade_item:0fc71fc7-3f1d-4f96-9c60-bdafb6ce00a4";
const AT = "2026-11-16T01:00:00.000Z";

function listRow(over: Record<string, unknown> = {}) {
  return {
    roomId: ROOM,
    chatDomain: "trade" as const,
    domainIdentityKey: `trade:${POST}:${VIEWER}:${BUYER}`,
    itemId: POST,
    sellerUserId: VIEWER,
    buyerUserId: BUYER,
    viewerRole: "seller" as const,
    productChatId: PCID,
    directKey: SERVER_KEY,
    productTitle: "팝니다 · Toyota Vios",
    productImageUrl: null,
    peerLabel: "zxzx11",
    previewText: "hi",
    statusBadge: null,
    unreadCount: 0,
    lastMessageAt: AT,
    href: `/community-messenger/rooms/${ROOM}`,
    ...over,
  };
}

function serverSnapshot(): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: VIEWER,
    room: {
      ...domainTradeListRowToUnifiedItem(listRow()).room,
      messengerDirectKey: SERVER_KEY,
      contextMeta: { v: 1, kind: "trade", headline: "팝니다 · Toyota Vios", productChatId: PCID, roleLabel: "판매자" },
      lastMessage: "hi",
      lastMessageAt: AT,
    },
    members: [{ id: VIEWER } as never, { id: BUYER } as never],
    messages: [{ id: "m1", roomId: ROOM, senderId: BUYER, content: "hi", createdAt: AT } as never],
    myRole: "member",
    activeCall: null,
  };
}

beforeEach(() => clearAllRoomSnapshotCaches());

describe("S1 거래 목록 시드 = 서버 값", () => {
  it("productChatId·서버 방 키·「판매자/구매자」 표기를 그대로 싣는다", () => {
    const room = domainTradeListRowToUnifiedItem(listRow()).room;
    expect(room.contextMeta?.kind === "trade" && room.contextMeta.productChatId).toBe(PCID);
    expect(room.messengerDirectKey).toBe(SERVER_KEY);
    expect(messengerTradeViewerRoleFromContextMeta(room.contextMeta)).toBe("seller");
    const buyer = domainTradeListRowToUnifiedItem(listRow({ viewerRole: "buyer" })).room;
    expect(messengerTradeViewerRoleFromContextMeta(buyer.contextMeta)).toBe("buyer");
  });
  it("서버 값이 없으면 지어내지 않는다(글 id 로 방 키 만들지 않음)", () => {
    const room = domainTradeListRowToUnifiedItem(listRow({ productChatId: undefined, directKey: undefined })).room;
    expect(room.messengerDirectKey).toBeNull();
    expect(room.contextMeta?.kind === "trade" && room.contextMeta.productChatId).toBeFalsy();
  });
});

describe("S2 목록 요약은 서버 방 데이터를 덮지 않는다", () => {
  it("서버 스냅샷이 있으면 contextMeta·방 키 유지, 안 읽은 수는 반영, 신선도는 그대로", () => {
    primeRoomSnapshot(ROOM, serverSnapshot());
    const ageBefore = getRoomSnapshotCacheAgeMs(ROOM, VIEWER);
    const listRoom = domainTradeListRowToUnifiedItem(listRow({ productChatId: undefined, directKey: undefined, unreadCount: 3 })).room;
    seedRoomSnapshotFromSummary({ room: listRoom, viewerUserId: VIEWER });
    const after = peekRoomSnapshot(ROOM, VIEWER)!;
    expect(after.listSeedPending).toBeUndefined();
    expect(after.room.messengerDirectKey).toBe(SERVER_KEY);
    expect(after.room.contextMeta?.kind === "trade" && after.room.contextMeta.productChatId).toBe(PCID);
    expect(after.room.unreadCount).toBe(3);
    expect(getRoomSnapshotCacheAgeMs(ROOM, VIEWER)).toBeGreaterThanOrEqual(ageBefore ?? 0);
  });
});

describe("S3 목록 요약만으로 만든 시드", () => {
  it("시드 표시를 달고 「최신」·「목록 이후 받음」으로 보지 않는다", () => {
    const listRoom = domainTradeListRowToUnifiedItem(listRow()).room;
    seedRoomSnapshotFromSummary({
      room: listRoom,
      viewerUserId: VIEWER,
      message: { id: "m1", roomId: ROOM, senderId: BUYER, content: "hi", createdAt: AT } as never,
    });
    expect(peekRoomSnapshot(ROOM, VIEWER)?.listSeedPending).toBe(true);
    expect(peekHotRoomSnapshot(ROOM, VIEWER)?.listSeedPending).toBe(true);
    expect(isRoomSnapshotFreshWithin(ROOM, 60_000, VIEWER)).toBe(false);
    expect(getRoomSnapshotCacheAgeMs(ROOM, VIEWER)).toBeNull();
    expect(isRoomSnapshotCurrentForListActivity(ROOM, AT)).toBe(false);
  });
  it("서버 스냅샷이 오면 시드를 교체하고, 권위 선택에서 서버가 이긴다", () => {
    const listRoom = domainTradeListRowToUnifiedItem(listRow()).room;
    seedRoomSnapshotFromSummary({ room: listRoom, viewerUserId: VIEWER });
    const seed = peekRoomSnapshot(ROOM, VIEWER)!;
    const server = serverSnapshot();
    expect(pickRichestAuthoritativeRoomSnapshot(seed, server)).toBe(server);
    primeRoomSnapshot(ROOM, server);
    expect(peekRoomSnapshot(ROOM, VIEWER)?.listSeedPending).toBeUndefined();
  });
  it("포그라운드 병합은 시드 표시를 지우고 서버 방 데이터를 쓴다", () => {
    const seed: CommunityMessengerRoomSnapshot = {
      ...serverSnapshot(),
      listSeedPending: true,
      members: [],
      room: domainTradeListRowToUnifiedItem(listRow({ productChatId: undefined, directKey: undefined })).room,
    };
    const merged = mergeCommunityMessengerForegroundBootstrapIntoSnapshot(seed, serverSnapshot());
    expect(merged.listSeedPending).toBeUndefined();
    expect(merged.room.messengerDirectKey).toBe(SERVER_KEY);
    expect(merged.room.contextMeta?.kind === "trade" && merged.room.contextMeta.productChatId).toBe(PCID);
    expect(merged.members.length).toBe(2);
  });
});
