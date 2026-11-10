/**
 * 거래 채팅·주문 채팅 목록 (`/community-messenger/trade-chats` · `/delivery-chats`) — 채팅 시안 4판 「9」「10」 순수 규칙.
 * 화면 글자는 카탈로그 키만 쓴다. 주문 상태 판단은 `store-order-process-model` 정본만 쓴다.
 */
import { isStoreOrderBuyerHideAllowedStatus, isStoreOrderTerminalStatus } from "@/lib/stores/store-order-process-model";
import type { SellerListingState } from "@/lib/products/seller-listing-state";

/** 주문 채팅 목록 탭 — 전체 · 진행 중 · 지난 주문 */
export type StoreOrderChatListTab = "all" | "live" | "past";

export const STORE_ORDER_CHAT_LIST_TABS: readonly StoreOrderChatListTab[] = ["all", "live", "past"];

/**
 * 지난 주문 = 끝난 주문(완료·취소·환불 — 구매자 「목록에서 숨기기」 허용 상태와 같은 정의).
 * 상태를 모르는 행(옛 캐시·상태 없음)은 진행 중으로 센다 — 숨기지 않는다.
 */
export function storeOrderChatListTabOfStatus(orderStatus: string | null | undefined): "live" | "past" {
  const status = typeof orderStatus === "string" ? orderStatus.trim() : "";
  return status && isStoreOrderBuyerHideAllowedStatus(status) ? "past" : "live";
}

export function filterStoreOrderChatListByTab<T>(
  items: readonly T[],
  tab: StoreOrderChatListTab,
  orderStatusOf: (item: T) => string | null | undefined
): T[] {
  if (tab === "all") return [...items];
  return items.filter((item) => storeOrderChatListTabOfStatus(orderStatusOf(item)) === tab);
}

/** 상태 칩 색 묶음 — 진행(초록) · 예약(노랑) · 끝남(회색) · 취소·거절(빨강) */
export type PillarChatStatusChipTone = "ok" | "warn" | "muted" | "danger";

/** 주문 상태 → 칩 색: 취소·환불·요청(터미널) = 빨강 · 완료 = 회색 · 그 외 진행 중 = 초록 */
export function storeOrderChatStatusChipTone(orderStatus: string | null | undefined): PillarChatStatusChipTone {
  const status = typeof orderStatus === "string" ? orderStatus.trim() : "";
  if (status === "completed") return "muted";
  if (status && isStoreOrderTerminalStatus(status)) return "danger";
  return "ok";
}

/** 거래 판매 단계 → 칩 색: 판매중·문의중 = 초록 · 예약중 = 노랑 · 판매완료 = 회색 */
export function tradeChatStatusChipTone(listingState: SellerListingState): PillarChatStatusChipTone {
  if (listingState === "reserved") return "warn";
  if (listingState === "completed") return "muted";
  return "ok";
}

/**
 * 고객 주문 상세 — 주문 알림 「주문 내역에서 보기」와 같은 주소 (`lib/notifications/inbox-events-merge.ts`).
 */
export function customerStoreOrderDetailHref(orderId: string | null | undefined): string | null {
  const id = typeof orderId === "string" ? orderId.trim() : "";
  return id ? `/mypage/store-orders/${encodeURIComponent(id)}` : null;
}

export type MarkAllReadTarget = { roomId: string; unreadCount: number };

/** 「모두 읽음」 동시 요청 수 — 주문 채팅 목록에서 쓰던 값 그대로 */
export const PILLAR_MARK_ALL_READ_CONCURRENCY = 4;

/** 안 읽은 방만 골라 묶음(동시 `concurrency`)으로 읽음 처리. 실패한 방 수를 돌려준다. */
export async function runPillarMarkAllRead(
  rows: readonly MarkAllReadTarget[],
  markOne: (roomId: string, preUnread: number) => Promise<boolean>,
  concurrency: number = PILLAR_MARK_ALL_READ_CONCURRENCY
): Promise<{ attempted: number; failed: number }> {
  const targets = rows.filter((r) => r.roomId.trim() && r.unreadCount > 0);
  const size = Math.max(1, Math.floor(concurrency));
  let failed = 0;
  for (let i = 0; i < targets.length; i += size) {
    const chunk = targets.slice(i, i + size);
    const results = await Promise.all(chunk.map((r) => markOne(r.roomId.trim(), r.unreadCount)));
    failed += results.filter((ok) => !ok).length;
  }
  return { attempted: targets.length, failed };
}
