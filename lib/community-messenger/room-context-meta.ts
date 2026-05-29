import type {
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

/**
 * `community_messenger_rooms.summary` 에 JSON 으로 넣는 거래/배달 컨텍스트(v1).
 * 백엔드가 채우지 않으면 null — 목록은 기존 휴리스틱(제목/요약 키워드)만 사용.
 *
 * 예:
 * `{"v":1,"kind":"trade","headline":"상품명","priceLabel":"29,000원","thumbnailUrl":"https://…","roleLabel":"구매자","itemStateLabel":"판매중","categoryMenuLabel":"중고거래","productCategoryLabel":"생활가전","sellerDisplayName":"닉네임"}`
 */
export function parseCommunityMessengerRoomContextMeta(raw: string | null | undefined): CommunityMessengerRoomContextMetaV1 | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s[0] !== "{") return null;
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.v !== 1) return null;
    if (o.kind !== "trade" && o.kind !== "delivery") return null;
    const out: CommunityMessengerRoomContextMetaV1 = { v: 1, kind: o.kind };
    if (typeof o.headline === "string" && o.headline.trim()) out.headline = o.headline.trim();
    if (typeof o.priceLabel === "string" && o.priceLabel.trim()) out.priceLabel = o.priceLabel.trim();
    if (o.thumbnailUrl === null) {
      out.thumbnailUrl = null;
    } else if (typeof o.thumbnailUrl === "string" && o.thumbnailUrl.trim()) {
      out.thumbnailUrl = o.thumbnailUrl.trim();
    }
    if (typeof o.stepLabel === "string" && o.stepLabel.trim()) out.stepLabel = o.stepLabel.trim();
    if (typeof o.roleLabel === "string" && o.roleLabel.trim()) out.roleLabel = o.roleLabel.trim();
    if (typeof o.itemStateLabel === "string" && o.itemStateLabel.trim()) out.itemStateLabel = o.itemStateLabel.trim();
    if (typeof o.categoryMenuLabel === "string" && o.categoryMenuLabel.trim()) {
      out.categoryMenuLabel = o.categoryMenuLabel.trim();
    }
    if (typeof o.productCategoryLabel === "string" && o.productCategoryLabel.trim()) {
      out.productCategoryLabel = o.productCategoryLabel.trim();
    }
    if (typeof o.productChatId === "string" && o.productChatId.trim()) out.productChatId = o.productChatId.trim();
    if (typeof o.postId === "string" && o.postId.trim()) out.postId = o.postId.trim();
    if (typeof o.sellerDisplayName === "string" && o.sellerDisplayName.trim()) {
      out.sellerDisplayName = o.sellerDisplayName.trim();
    }
    if (typeof o.tradeFlowStatus === "string" && o.tradeFlowStatus.trim()) {
      out.tradeFlowStatus = o.tradeFlowStatus.trim();
    }
    if (typeof o.storeOrderId === "string" && o.storeOrderId.trim()) out.storeOrderId = o.storeOrderId.trim();
    if (typeof o.orderNo === "string" && o.orderNo.trim()) out.orderNo = o.orderNo.trim();
    if (typeof o.storeId === "string" && o.storeId.trim()) out.storeId = o.storeId.trim();
    if (typeof o.storeDisplayName === "string" && o.storeDisplayName.trim()) {
      out.storeDisplayName = o.storeDisplayName.trim();
    }
    if (typeof o.fulfillmentType === "string" && o.fulfillmentType.trim()) {
      out.fulfillmentType = o.fulfillmentType.trim();
    }
    return out;
  } catch {
    return null;
  }
}

/** DB `summary` 컬럼에 저장할 문자열 — 파서와 쌍을 이룸 */
export function serializeCommunityMessengerRoomContextMeta(meta: CommunityMessengerRoomContextMetaV1): string {
  return JSON.stringify(meta);
}

/** 배달·매장 주문 채팅 방 판별 — `contextMeta`·`summary` JSON·`direct_key` 통합. */
export type CommunityMessengerRoomDeliveryDetectSource = Pick<
  CommunityMessengerRoomSummary,
  "contextMeta" | "messengerDirectKey" | "summary"
>;

/**
 * 배달 주문 메신저 방의 컨텍스트 메타 — composer·셸 `delivery-ui` 에 사용.
 * `contextMeta` 만 보면 instant shell·레거시 방에서 주문자 입력 라인(pill)이 빠진다.
 * DO NOT: `kind === "delivery"` 단일 조건만 쓰면 summary/direct_key 방에서 일반 입력줄로 떨어짐.
 */
export function resolveCommunityMessengerDeliveryContextMeta(
  room: CommunityMessengerRoomDeliveryDetectSource
): CommunityMessengerRoomContextMetaV1 | null {
  const inline = room.contextMeta;
  if (inline?.kind === "delivery") return inline;
  const fromSummary = parseCommunityMessengerRoomContextMeta(
    typeof room.summary === "string" ? room.summary : null
  );
  if (fromSummary?.kind === "delivery") return fromSummary;
  const dk = room.messengerDirectKey?.trim() ?? "";
  if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) {
    const orderId = dk.slice(dk.indexOf(":") + 1).trim();
    if (orderId) return { v: 1, kind: "delivery", storeOrderId: orderId };
  }
  return null;
}

export function isCommunityMessengerStoreOrderDeliveryRoom(
  room: CommunityMessengerRoomDeliveryDetectSource
): boolean {
  return resolveCommunityMessengerDeliveryContextMeta(room) != null;
}
