/**
 * 언어 SSOT B3 — 주문 채팅 목록(고객·사장님) 미리보기: 저장 시스템 문장을 종류 코드 메타로 보는 사람 언어로.
 * 메타가 없거나 저장 글자와 맞지 않으면 지금과 같은 저장 글자. 주문 요약은 가림 정책 그대로.
 */
import { describe, expect, it } from "vitest";
import { cmRoomLastMessageMetaFromMessage } from "@/lib/community-messenger/system-message-i18n";
import { translate } from "@/lib/i18n/messages";
import {
  STORE_ORDER_DOMAIN,
  STORE_ORDER_SUMMARY_REDACTED_PREVIEW,
  buildStoreOrderCustomerListViewModel,
  buildStoreOrderHubViewModel,
  buildStoreOrderOwnerListViewModel,
  type StoreOrderListItem,
} from "@/lib/messenger/store-order";
import { mapStoreOrderListItem } from "@/lib/messenger/store-order/list";

const BODY = "배달이 완료되었어요.";
const SUMMARY = "📋 주문 요약\n매장: X\n주문번호: SO1\n합계: ₱100";

function row(partial: Partial<StoreOrderListItem>): StoreOrderListItem {
  return {
    roomId: "room-1",
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: "store_order:o1",
    orderId: "o1",
    storeId: "store-1",
    storeName: "맛있는집",
    storeImageUrl: null,
    customerUserId: "buyer-1",
    customerName: "Buyer",
    customerAvatarUrl: null,
    latestChatMessageText: BODY,
    latestChatMessageAt: "2026-07-22T00:00:00.000Z",
    latestChatMessageType: "text",
    unreadCount: 0,
    orderStatusLabel: "delivered",
    fulfillmentType: "local_delivery",
    generation: "test",
    ...partial,
  };
}

describe("B3 store-order list — stored system preview in viewer language", () => {
  it("message_key meta → English / Korean key text on customer, owner and hub", () => {
    const meta = cmRoomLastMessageMetaFromMessage(BODY, { domain: "store_order", message_key: "order_event_delivered" });
    const item = row({ lastMessageMeta: meta });
    const en = translate("en", "order_event_delivered");
    const ko = translate("ko", "order_event_delivered");
    expect(buildStoreOrderCustomerListViewModel(item, "en").previewText).toBe(en);
    expect(buildStoreOrderOwnerListViewModel(item, "en").previewText).toBe(en);
    expect(buildStoreOrderCustomerListViewModel(item, "ko").previewText).toBe(ko);
    expect(buildStoreOrderHubViewModel([item], "en").previewText).toBe(en);
    expect(buildStoreOrderHubViewModel([item], "ko").previewText).toBe(ko);
  });

  it("meta absent → stored text (same as before)", () => {
    const item = row({});
    expect(buildStoreOrderCustomerListViewModel(item, "en").previewText).toBe(BODY);
    expect(buildStoreOrderHubViewModel([item], "en").previewText).toBe(BODY);
  });

  it("meta text mismatch → stored text", () => {
    const meta = cmRoomLastMessageMetaFromMessage("이전 메시지", { message_key: "order_event_delivered" });
    const item = row({ lastMessageMeta: meta });
    expect(buildStoreOrderCustomerListViewModel(item, "en").previewText).toBe(BODY);
  });

  it("order summary meta → redaction policy unchanged", () => {
    const meta = cmRoomLastMessageMetaFromMessage(SUMMARY, { kind: "store_order_summary" });
    const item = row({ latestChatMessageText: SUMMARY, lastMessageMeta: meta });
    expect(buildStoreOrderCustomerListViewModel(item, "en").previewText).toBe(STORE_ORDER_SUMMARY_REDACTED_PREVIEW);
  });

  it("list mapping carries lastMessageMeta only when present", () => {
    const meta = cmRoomLastMessageMetaFromMessage(BODY, { message_key: "order_event_delivered" });
    const base = {
      roomId: "room-1",
      chatDomain: STORE_ORDER_DOMAIN,
      domainIdentityKey: "store_order:o1",
      orderId: "o1",
      storeId: "store-1",
      storeName: "S",
      storeImageUrl: null,
      customerUserId: "buyer-1",
      customerName: "B",
      customerAvatarUrl: null,
      latestChatMessageText: BODY,
      latestChatMessageAt: "2026-07-22T00:00:00.000Z",
      unreadCount: 0,
    };
    expect(mapStoreOrderListItem({ ...base, lastMessageMeta: meta }, "g").lastMessageMeta).toEqual(meta);
    expect(mapStoreOrderListItem(base, "g")).not.toHaveProperty("lastMessageMeta");
  });
});
