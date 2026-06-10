import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import type { OwnerOrder } from "@/lib/store-owner/types";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import { formatMoneyPhp } from "@/lib/utils/format";

/**
 * 스토어 주문·장바구니 등에서 커뮤니티 메신저 목록용 컨텍스트(v1)를 만든다.
 * 실제 방 `summary` 저장은 `updateCommunityMessengerRoomContextMeta` 또는 PATCH `context_meta`.
 * 채팅방으로 이동할 때는 `buildCommunityMessengerRoomUrlWithContext` (`cm-ctx-url`) 로 `?cm_ctx=` 딥링크를 붙이면 입장 시 자동 동기화된다.
 */
export type StoreOrderMessengerContextInput = {
  /** 매장명 — 목록 행·헤더(피어 id 대신) */
  storeName?: string | null;
  /** `store_orders.fulfillment_type` 등 */
  fulfillmentType?: string | null;
  /** `store_orders.id` — 메신저 delivery pillar 의 안정 식별자 */
  storeOrderId?: string | null;
  /** 주문 번호 */
  orderNo?: string | null;
  /** 매장 id */
  storeId?: string | null;
  storeVoiceMessagesEnabled?: boolean | null;
  storeVoiceCallsEnabled?: boolean | null;
  storeVideoCallsEnabled?: boolean | null;
  /** 상품명·주문 한 줄 제목 */
  productTitle: string;
  thumbnailUrl?: string | null;
  /** 표시용 합계(페소) */
  paymentAmount?: number | null;
  /** UI/주문 상태 라벨 (예: 상품준비, 배송중) */
  orderStatusLabel?: string | null;
};

export function buildMessengerContextMetaFromStoreOrder(input: StoreOrderMessengerContextInput): CommunityMessengerRoomContextMetaV1 {
  const ft = (input.fulfillmentType ?? "").trim().toLowerCase();
  /** 주문 채팅은 pickup 이어도 거래 채팅이 아니다. 메신저 안에서는 항상 delivery/store_order pillar 로 분류한다. */
  const lang = getRuntimeAppLanguage();
  const headline = input.productTitle.trim() || translate(lang, "store_messenger_order_fallback");
  const meta: CommunityMessengerRoomContextMetaV1 = { v: 1, kind: "delivery", headline };
  const storeDisplayName = input.storeName?.trim();
  if (storeDisplayName) meta.storeDisplayName = storeDisplayName;
  const storeOrderId = input.storeOrderId?.trim();
  if (storeOrderId) meta.storeOrderId = storeOrderId;
  const orderNo = input.orderNo?.trim();
  if (orderNo) meta.orderNo = orderNo;
  const storeId = input.storeId?.trim();
  if (storeId) meta.storeId = storeId;
  if (typeof input.storeVoiceMessagesEnabled === "boolean") {
    meta.storeVoiceMessagesEnabled = input.storeVoiceMessagesEnabled;
  }
  if (typeof input.storeVoiceCallsEnabled === "boolean") {
    meta.storeVoiceCallsEnabled = input.storeVoiceCallsEnabled;
  }
  if (typeof input.storeVideoCallsEnabled === "boolean") {
    meta.storeVideoCallsEnabled = input.storeVideoCallsEnabled;
  }
  if (ft) meta.fulfillmentType = ft;
  if (typeof input.paymentAmount === "number" && Number.isFinite(input.paymentAmount) && input.paymentAmount >= 0) {
    meta.priceLabel = formatMoneyPhp(input.paymentAmount);
  }
  if (input.thumbnailUrl === null) {
    meta.thumbnailUrl = null;
  } else if (typeof input.thumbnailUrl === "string" && input.thumbnailUrl.trim()) {
    meta.thumbnailUrl = input.thumbnailUrl.trim();
  }
  const step = input.orderStatusLabel?.trim();
  if (step) meta.stepLabel = step;
  return meta;
}

/** 구매자 목록·상세 등 `store_orders` 스냅샷 → `StoreOrderMessengerDeepLink` 의 `context` */
export function buildMessengerContextInputFromStoreOrderSnapshot(
  args: {
    orderId?: string | null;
    storeName: string;
    orderNo: string;
    storeId?: string | null;
    fulfillmentType: string;
    orderStatus: string;
    paymentAmount: number;
    firstLineProductTitle?: string | null;
    thumbnailUrl?: string | null;
    storeVoiceMessagesEnabled?: boolean | null;
    storeVoiceCallsEnabled?: boolean | null;
    storeVideoCallsEnabled?: boolean | null;
  },
  lang: AppLanguageCode = getRuntimeAppLanguage()
): StoreOrderMessengerContextInput {
  const store = args.storeName.trim();
  const line = args.firstLineProductTitle?.trim();
  const headline = line
    ? `${store} · ${line}`
    : translate(lang, "store_messenger_order_title", { store, orderNo: args.orderNo });
  const ft = (args.fulfillmentType ?? "").trim().toLowerCase();
  /** `shipping` 은 기존 주문 타입 명칭이고 메신저 컨텍스트에는 local_delivery 로 정규화한다. */
  const fulfillmentForMeta = ft === "shipping" ? "local_delivery" : args.fulfillmentType;
  return {
    storeName: store,
    storeOrderId: args.orderId ?? null,
    orderNo: args.orderNo,
    storeId: args.storeId ?? null,
    fulfillmentType: fulfillmentForMeta,
    productTitle: headline,
    paymentAmount: args.paymentAmount,
    orderStatusLabel: buyerOrderStatusLabel(args.orderStatus, lang),
    thumbnailUrl: args.thumbnailUrl ?? null,
    storeVoiceMessagesEnabled: args.storeVoiceMessagesEnabled ?? null,
    storeVoiceCallsEnabled: args.storeVoiceCallsEnabled ?? null,
    storeVideoCallsEnabled: args.storeVideoCallsEnabled ?? null,
  };
}

function fulfillmentTypeForMessengerFromOwnerOrderType(orderType: OwnerOrder["order_type"]): string {
  if (orderType === "delivery" || orderType === "shipping") return "local_delivery";
  return "pickup";
}

/** 오너 카드·상세 `OwnerOrder` → 메신저 `cm_ctx` */
export function buildMessengerContextInputFromOwnerOrder(order: OwnerOrder): StoreOrderMessengerContextInput {
  const first = order.items[0]?.menu_name?.trim();
  return buildMessengerContextInputFromStoreOrderSnapshot({
    orderId: order.id,
    storeName: order.store_name,
    orderNo: order.order_no,
    storeId: order.store_id,
    fulfillmentType: fulfillmentTypeForMessengerFromOwnerOrderType(order.order_type),
    orderStatus: order.order_status,
    paymentAmount: order.total_amount,
    firstLineProductTitle: first ?? null,
    thumbnailUrl: null,
  });
}
