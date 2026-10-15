/**
 * B-3 — 거래 리스트 프리뷰: viewer(role) 기준 통화 문구 + 실제 message_type 라벨.
 * B-4 — 마이페이지 메신저 개요 프리뷰는 홈 리스트 포맷터(getRoomPreviewText)와 동일.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encodeCallStubRoomTip } from "@/lib/community-messenger/call-stub-room-tip";
import { formatCmListPreviewTextForViewer, getRoomPreviewText } from "@/lib/community-messenger/cm-home-list-copy";
import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";
import { buildTradeChatListPreviewLine } from "@/lib/community-messenger/trade-chat-list/view-model";
import { buildDeliveryChatListPreviewLine } from "@/lib/community-messenger/delivery-chat-list/delivery-chat-list-preview";
import type { CommunityMessengerMessage, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { translate } from "@/lib/i18n/messages";
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import { mapTradeLoaderBatchRows } from "@/lib/messenger/trade/phase11a-db-loader";
import { buildTradeListSnapshot, buildTradeListViewModel, buildTradeIdentity, TRADE_DOMAIN } from "@/lib/messenger/trade";
import type { TradeRoomInput } from "@/lib/messenger/trade/types";

const SELLER = "seller-1";
const BUYER = "buyer-1";

const CALL_TOKEN = encodeCallStubRoomTip({
  callKind: "voice",
  status: "cancelled",
  resolvedEvent: "cancelled" as never,
  initiatorUserId: SELLER,
  recipientUserId: BUYER,
  durationSeconds: 0,
  sharedLabel: "음성 통화 · 취소됨",
});

function tradeRoom(partial: Partial<TradeRoomInput>): TradeRoomInput {
  return {
    roomId: "r1",
    chatDomain: TRADE_DOMAIN,
    domainIdentityKey: buildTradeIdentity({ itemId: "item-a", sellerUserId: SELLER, counterpartyUserId: BUYER })
      .identityKey,
    itemId: "item-a",
    sellerUserId: SELLER,
    counterpartyUserId: BUYER,
    itemTitle: "Item",
    itemImageUrl: null,
    peerDisplayName: "Peer",
    peerAvatarUrl: null,
    lastMessage: "hello",
    lastMessageAt: "2026-07-14T12:00:00.000Z",
    lastMessageIsSystem: false,
    unreadCount: 0,
    tradeStatusLabel: "판매중",
    ...partial,
  };
}

function vmFor(viewer: string, room: TradeRoomInput) {
  const listed = buildTradeListSnapshot({ viewerUserId: viewer, generation: "1", rooms: [room] });
  if (!listed.ok) throw new Error(listed.error);
  const rows = listed.snapshot.rows;
  return { vm: buildTradeListViewModel(rows[0]!), hub: buildTradeHubViewModel(rows) };
}

describe("B-3 trade row-model preview — viewer-aware + real message type", () => {
  it("call_stub token resolves per viewer (caller vs callee), never raw token; hub matches row", () => {
    const room = tradeRoom({ lastMessage: CALL_TOKEN, lastMessageType: "call_stub", lastMessageIsSystem: true });
    const seller = vmFor(SELLER, room);
    const buyer = vmFor(BUYER, room);
    expect(seller.vm.previewText).not.toContain("cmcall1|");
    expect(buyer.vm.previewText).not.toContain("cmcall1|");
    expect(seller.vm.previewText).toBe(
      formatCmListPreviewTextForViewer({ lastMessage: CALL_TOKEN, lastMessageType: "call_stub" }, SELLER)
    );
    expect(buyer.vm.previewText).toBe(
      formatCmListPreviewTextForViewer({ lastMessage: CALL_TOKEN, lastMessageType: "call_stub" }, BUYER)
    );
    expect(seller.vm.previewText).not.toBe(buyer.vm.previewText);
    expect(seller.vm.previewIsSystemEvent).toBe(true);
    expect(seller.hub.previewText).toBe(seller.vm.previewText);
  });

  it("legacy token without lastMessageType still resolved for viewer (no raw token)", () => {
    const { vm } = vmFor(BUYER, tradeRoom({ lastMessage: CALL_TOKEN, lastMessageIsSystem: true }));
    expect(vm.previewText).not.toContain("cmcall1|");
  });

  it("sticker / gift_certificate / community_post_share use home-list labels", () => {
    expect(
      vmFor(SELLER, tradeRoom({ lastMessage: "/stickers/a/b.webp", lastMessageType: "sticker" })).vm.previewText
    ).toBe(translateCmUi("cm_home_preview_sticker"));
    expect(
      vmFor(SELLER, tradeRoom({ lastMessage: "Gift certificate", lastMessageType: "gift_certificate" })).vm.previewText
    ).toBe(translateCmUi("cm_home_preview_gift"));
    expect(
      vmFor(SELLER, tradeRoom({ lastMessage: "{\"postId\":1}", lastMessageType: "community_post_share" })).vm
        .previewText
    ).toBe(translateCmUi("cm_home_preview_post_share"));
  });

  it("plain text unchanged", () => {
    expect(vmFor(SELLER, tradeRoom({ lastMessage: "안녕하세요", lastMessageType: "text" })).vm.previewText).toBe(
      "안녕하세요"
    );
  });

  it("db loader carries latest message_type into TradeRoomInput", () => {
    const out = mapTradeLoaderBatchRows({
      viewerUserId: SELLER,
      rows: [
        {
          roomId: "r1",
          chatDomain: TRADE_DOMAIN,
          domainIdentityKey: buildTradeIdentity({ itemId: "item-a", sellerUserId: SELLER, counterpartyUserId: BUYER })
            .identityKey,
          itemId: "item-a",
          sellerUserId: SELLER,
          counterpartyUserId: BUYER,
          itemTitle: "Item",
          itemImageUrl: null,
          peerDisplayName: "Peer",
          peerAvatarUrl: null,
          unreadCount: 0,
          latestMessage: {
            roomId: "r1",
            bodyText: "/stickers/a/b.webp",
            isSystem: false,
            createdAt: "2026-07-14T12:00:00.000Z",
            messageType: "sticker",
          },
        },
      ],
    });
    expect(out[0]!.lastMessageType).toBe("sticker");
  });
});

describe("B-3 trade/delivery live snippet — gift & share labels", () => {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate("ko", key, vars);
  function msg(messageType: CommunityMessengerMessage["messageType"], content: string): CommunityMessengerMessage {
    return { id: "m1", roomId: "r1", messageType, content, isMine: true } as CommunityMessengerMessage;
  }
  it("trade snippet labels gift_certificate / community_post_share (no raw English)", () => {
    const gift = buildTradeChatListPreviewLine({
      listPreview: "",
      peerName: "Peer",
      lastClientMessage: msg("gift_certificate", "Gift certificate"),
      t,
    });
    expect(gift).toContain(t("cm_ui_gift_certificate"));
    expect(gift).not.toContain("Gift certificate");
    const share = buildTradeChatListPreviewLine({
      listPreview: "",
      peerName: "Peer",
      lastClientMessage: msg("community_post_share", "{\"postId\":1}"),
      t,
    });
    expect(share).toContain(t("cm_home_preview_post_share"));
    expect(share).not.toContain("postId");
  });
  it("delivery snippet aligned for community_post_share", () => {
    const share = buildDeliveryChatListPreviewLine({
      listPreview: "",
      storeName: "Store",
      lastClientMessage: msg("community_post_share", "{\"postId\":1}"),
      t,
    });
    expect(share).toContain(t("cm_home_preview_post_share"));
  });
});

describe("B-4 MessengerOverviewPanel preview", () => {
  function room(partial: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
    return { id: "r", title: "T", summary: "", lastMessage: "", lastMessageAt: "", ...partial } as CommunityMessengerRoomSummary;
  }
  it("getRoomPreviewText labels sticker/gift/call token and hides context-meta JSON summary", () => {
    expect(getRoomPreviewText(room({ lastMessage: "스티커", lastMessageType: "sticker" }), SELLER)).toBe(
      translateCmUi("cm_home_preview_sticker")
    );
    expect(getRoomPreviewText(room({ lastMessage: "Gift certificate", lastMessageType: "gift_certificate" }), SELLER)).toBe(
      translateCmUi("cm_home_preview_gift")
    );
    expect(getRoomPreviewText(room({ lastMessage: CALL_TOKEN, lastMessageType: "call_stub" }), BUYER)).not.toContain(
      "cmcall1|"
    );
    const jsonPreview = getRoomPreviewText(room({ summary: '{"v":1,"kind":"trade"}', lastMessageType: "system" }), SELLER);
    expect(jsonPreview.startsWith("{")).toBe(false);
  });
  it("panel renders through getRoomPreviewText with viewer id (not raw lastMessage/summary)", () => {
    const src = readFileSync(join(process.cwd(), "components/mypage/MessengerOverviewPanel.tsx"), "utf8");
    expect(src).toContain("getRoomPreviewText(room, viewerUserId)");
    expect(src).not.toContain("room.lastMessage || room.summary");
  });
});
