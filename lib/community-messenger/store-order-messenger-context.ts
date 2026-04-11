import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import type { OwnerOrder } from "@/lib/store-owner/types";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { formatMoneyPhp } from "@/lib/utils/format";

/**
 * 스토어 주문·장바구니 등에서 커뮤니티 메신저 목록용 컨텍스트(v1)를 만든다.
 * 실제 방 `summary` 저장은 `updateCommunityMessengerRoomContextMeta` 또는 PATCH `context_meta`.
 * 채팅방으로 이동할 때는 `buildCommunityMessengerRoomUrlWithContext` (`cm-ctx-url`) 로 `?cm_ctx=` 딥링크를 붙이면 입장 시 자동 동기화된다.
 */
export type StoreOrderMessengerContextInput = {
  /** `store_orders.fulfillment_type` 등 */
  fulfillmentType?: string | null;
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
  const kind: "trade" | "delivery" = ft === "local_delivery" ? "delivery" : "trade";
  const headline = input.productTitle.trim() || (kind === "delivery" ? "배달 주문" : "거래");
  const meta: CommunityMessengerRoomContextMetaV1 = { v: 1, kind, headline };
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
export function buildMessengerContextInputFromStoreOrderSnapshot(args: {
  storeName: string;
  orderNo: string;
  fulfillmentType: string;
  orderStatus: string;
  paymentAmount: number;
  firstLineProductTitle?: string | null;
  thumbnailUrl?: string | null;
}): StoreOrderMessengerContextInput {
  const store = args.storeName.trim();
  const line = args.firstLineProductTitle?.trim();
  const headline = line ? `${store} · ${line}` : `${store} · 주문 ${args.orderNo}`;
  const ft = (args.fulfillmentType ?? "").trim().toLowerCase();
  /** `buildMessengerContextMetaFromStoreOrder` 는 `local_delivery` 만 배달 카드로 분류 */
  const fulfillmentForMeta = ft === "shipping" ? "local_delivery" : args.fulfillmentType;
  return {
    fulfillmentType: fulfillmentForMeta,
    productTitle: headline,
    paymentAmount: args.paymentAmount,
    orderStatusLabel: BUYER_ORDER_STATUS_LABEL[args.orderStatus] ?? args.orderStatus,
    thumbnailUrl: args.thumbnailUrl ?? null,
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
    storeName: order.store_name,
    orderNo: order.order_no,
    fulfillmentType: fulfillmentTypeForMessengerFromOwnerOrderType(order.order_type),
    orderStatus: order.order_status,
    paymentAmount: order.total_amount,
    firstLineProductTitle: first ?? null,
    thumbnailUrl: null,
  });
}
