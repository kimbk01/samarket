/**
 * @vitest-environment jsdom
 *
 * B-2 — Realtime 행 원문(통화 토큰 `cmcall1|…` · 스티커 경로)이 거래/주문 도메인 리스트 previewText 로
 * 저장·렌더되지 않는다. 홈 리스트와 동일 포맷터(`getRoomPreviewText`) 사용.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  applyDomainStoreOrderListRealtimeMessagePatch,
  applyDomainTradeListRealtimeMessagePatch,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";
import {
  clearDomainTradeListCanaryCache,
  peekDomainTradeListCanaryCache,
  primeDomainTradeListCanaryCache,
} from "@/components/community-messenger/domain-shell-canary/domain-trade-list-canary-cache";
import {
  clearDomainStoreOrderCustomerListCanaryCache,
  peekDomainStoreOrderCustomerListCanaryCache,
  primeDomainStoreOrderCustomerListCanaryCache,
  type SoCustomerListDto,
} from "@/components/community-messenger/domain-shell-canary/domain-store-order-customer-list-canary-cache";
import { domainTradeListRowToUnifiedItem } from "@/components/community-messenger/domain-shell-canary/domain-trade-list-row-to-unified-item";
import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import {
  clearRoomActivityProjectionStateForTests,
  projectRoomActivityToHomeList,
  roomActivityFromMessageRow,
} from "@/lib/community-messenger/home/project-room-activity-to-home-list";
import { formatCmListPreviewTextForViewer, guardRawCmListPreviewText } from "@/lib/community-messenger/cm-home-list-copy";
import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";

const SELLER = "u-seller";
const BUYER = "u-buyer";

function seedTradeDto(): TradeListDto {
  return {
    authority: "domain_trade_list_canary",
    viewerUserId: SELLER,
    producedAt: "2026-07-23T00:00:00.000Z",
    hub: { roomCount: 1, unreadRoomCount: 0, latestRoomId: "t-1", previewText: "old" },
    rows: [
      {
        roomId: "t-1",
        chatDomain: "trade",
        domainIdentityKey: `trade:i1:${SELLER}:${BUYER}`,
        itemId: "i1",
        sellerUserId: SELLER,
        buyerUserId: BUYER,
        viewerRole: "seller",
        productTitle: "Item",
        productImageUrl: null,
        peerLabel: null,
        peerAvatarUrl: null,
        previewText: "old",
        statusBadge: null,
        unreadCount: 0,
        lastMessageAt: "2026-07-20T00:00:00.000Z",
        href: "/x",
      },
    ],
  };
}

function seedSoDto(): SoCustomerListDto {
  return {
    authority: "domain_store_order_customer_list_canary",
    viewerUserId: BUYER,
    surfaceRole: "customer",
    producedAt: "2026-07-23T00:00:00.000Z",
    hub: { roomCount: 1, unreadRoomCount: 0, latestRoomId: "so-1", previewText: "old" },
    rows: [
      {
        roomId: "so-1",
        chatDomain: "store_order",
        domainIdentityKey: "so:1",
        orderId: "o1",
        storeName: "Store",
        storeImageUrl: null,
        previewText: "old",
        statusBadge: null,
        unreadCount: 0,
        lastMessageAt: "2026-07-20T00:00:00.000Z",
        href: "/y",
        exposesMemberIdentity: false,
      },
    ],
  } as SoCustomerListDto;
}

function callStubRow(roomId: string, id: string): Record<string, unknown> {
  return {
    id,
    room_id: roomId,
    sender_id: SELLER,
    message_type: "call_stub",
    content: "음성 통화 · 취소됨",
    metadata: {
      callKind: "voice",
      callStatus: "cancelled",
      callResolvedEvent: "cancelled",
      initiatorUserId: SELLER,
      recipientUserId: BUYER,
      durationSeconds: 0,
    },
    created_at: "2026-07-24T00:00:00.000Z",
  };
}

function stickerRow(roomId: string, id: string): Record<string, unknown> {
  return {
    id,
    room_id: roomId,
    sender_id: BUYER,
    message_type: "sticker",
    content: "/stickers/runtime/3/smile.webp",
    metadata: null,
    created_at: "2026-07-25T00:00:00.000Z",
  };
}

describe("B-2 domain list canary — realtime preview label (no raw token)", () => {
  afterEach(() => {
    clearDomainTradeListCanaryCache(SELLER);
    clearDomainStoreOrderCustomerListCanaryCache(BUYER);
    clearRoomActivityProjectionStateForTests();
  });

  it("trade: call_stub realtime row stores viewer-resolved call label (not cmcall1 token)", () => {
    primeDomainTradeListCanaryCache(seedTradeDto());
    const activity = roomActivityFromMessageRow({
      roomId: "t-1",
      messageRow: callStubRow("t-1", "m-call-1"),
      source: "remote_message_realtime",
      boostUnread: false,
      viewerUserId: SELLER,
      chatDomain: "trade",
    });
    expect(activity).not.toBeNull();
    expect(activity!.previewText.startsWith("cmcall1|")).toBe(true);
    projectRoomActivityToHomeList(activity!);
    const row = peekDomainTradeListCanaryCache(SELLER)!.rows[0]!;
    expect(row.previewText).not.toContain("cmcall1|");
    expect(row.previewText).toBe(
      formatCmListPreviewTextForViewer({ lastMessage: activity!.previewText, lastMessageType: "call_stub" }, SELLER)
    );
    expect(row.previewText.length).toBeGreaterThan(0);
  });

  it("trade: sticker realtime row stores sticker label (not path)", () => {
    primeDomainTradeListCanaryCache(seedTradeDto());
    const activity = roomActivityFromMessageRow({
      roomId: "t-1",
      messageRow: stickerRow("t-1", "m-st-1"),
      source: "remote_message_realtime",
      boostUnread: true,
      viewerUserId: SELLER,
      chatDomain: "trade",
    });
    projectRoomActivityToHomeList(activity!);
    const row = peekDomainTradeListCanaryCache(SELLER)!.rows[0]!;
    expect(row.previewText).toBe(translateCmUi("cm_home_preview_sticker"));
    expect(row.unreadCount).toBe(1);
  });

  it("store_order: call_stub and sticker rows are labelled for the viewer", () => {
    primeDomainStoreOrderCustomerListCanaryCache(seedSoDto());
    const call = roomActivityFromMessageRow({
      roomId: "so-1",
      messageRow: callStubRow("so-1", "m-so-call"),
      source: "remote_message_realtime",
      boostUnread: true,
      viewerUserId: BUYER,
      chatDomain: "store_order",
    });
    projectRoomActivityToHomeList(call!);
    let row = peekDomainStoreOrderCustomerListCanaryCache(BUYER)!.rows[0]!;
    expect(row.previewText).not.toContain("cmcall1|");
    expect(row.previewText).toBe(
      formatCmListPreviewTextForViewer({ lastMessage: call!.previewText, lastMessageType: "call_stub" }, BUYER)
    );

    const sticker = roomActivityFromMessageRow({
      roomId: "so-1",
      messageRow: stickerRow("so-1", "m-so-st"),
      source: "remote_message_realtime",
      boostUnread: true,
      viewerUserId: BUYER,
      chatDomain: "store_order",
    });
    projectRoomActivityToHomeList(sticker!);
    row = peekDomainStoreOrderCustomerListCanaryCache(BUYER)!.rows[0]!;
    expect(row.previewText).toBe(translateCmUi("cm_home_preview_sticker"));
  });

  it("patch without lastMessageType still blocks raw tokens; plain text unchanged", () => {
    primeDomainTradeListCanaryCache(seedTradeDto());
    applyDomainTradeListRealtimeMessagePatch({
      viewerUserId: SELLER,
      roomId: "t-1",
      previewText: "/stickers/a/b.png",
      lastMessageAt: "2026-07-24T00:00:00.000Z",
      boostUnread: false,
    });
    expect(peekDomainTradeListCanaryCache(SELLER)!.rows[0]!.previewText).toBe(
      translateCmUi("cm_home_preview_sticker")
    );
    applyDomainTradeListRealtimeMessagePatch({
      viewerUserId: SELLER,
      roomId: "t-1",
      previewText: "hello",
      lastMessageAt: "2026-07-25T00:00:00.000Z",
      boostUnread: false,
    });
    expect(peekDomainTradeListCanaryCache(SELLER)!.rows[0]!.previewText).toBe("hello");

    primeDomainStoreOrderCustomerListCanaryCache(seedSoDto());
    applyDomainStoreOrderListRealtimeMessagePatch({
      viewerUserId: BUYER,
      roomId: "so-1",
      previewText: "gift raw",
      lastMessageType: "gift_certificate",
      lastMessageAt: "2026-07-24T00:00:00.000Z",
      boostUnread: false,
    });
    expect(peekDomainStoreOrderCustomerListCanaryCache(BUYER)!.rows[0]!.previewText).toBe(
      translateCmUi("cm_home_preview_gift")
    );
  });

  it("render guard: stored raw token in trade row never reaches unified item preview", () => {
    const token = "cmcall1|voice|cancelled|cancelled|u-seller|u-buyer|0|음성 통화 · 취소됨";
    const dto = seedTradeDto();
    const item = domainTradeListRowToUnifiedItem({ ...dto.rows[0]!, previewText: token });
    expect(item.preview).not.toContain("cmcall1|");
    expect(item.preview).toBe(guardRawCmListPreviewText(token, SELLER));
    const sticker = domainTradeListRowToUnifiedItem({ ...dto.rows[0]!, previewText: "sticker://runtime#3#x" });
    expect(sticker.preview).toBe(translateCmUi("cm_home_preview_sticker"));
    const text = domainTradeListRowToUnifiedItem({ ...dto.rows[0]!, previewText: "안녕하세요" });
    expect(text.preview).toBe("안녕하세요");
  });
});
