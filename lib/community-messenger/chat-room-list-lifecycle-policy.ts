/**
 * 거래·배달 채팅 목록 노출·readonly 정책 (pure, side-effect 없음).
 *
 * - 완료 후 7일: 목록 노출 + readonly
 * - 7일 초과: 목록 숨김 (hard delete 금지 — `room_status='archived'` 등은 별도 cron)
 * - 30일 hard purge: `COMPLETED_CHAT_HARD_PURGE_ELIGIBLE_MS` 상수만 예약 (cron 미구현)
 */
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";

/** 완료 거래·주문 채팅을 목록에 유지하는 기간 */
export const COMPLETED_CHAT_LIST_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;

/** 추후 hard purge cron eligibility — 이번 작업에서 사용하지 않음 */
export const COMPLETED_CHAT_HARD_PURGE_ELIGIBLE_MS = 30 * 24 * 60 * 60 * 1000;

const TRADE_READONLY_FLOW_STATUSES = new Set([
  "seller_marked_done",
  "buyer_confirmed",
  "review_completed",
  "archived",
]);

const TRADE_COMPLETED_ITEM_STATE_LABELS = new Set(["거래완료"]);

function trimIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function parseIsoMs(iso: string | null | undefined): number | null {
  const t = trimIso(iso);
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

function maxIsoMs(candidates: Array<string | null | undefined>): number | null {
  let best: number | null = null;
  for (const c of candidates) {
    const ms = parseIsoMs(c);
    if (ms == null) continue;
    if (best == null || ms > best) best = ms;
  }
  return best;
}

function tradeMeta(room: CommunityMessengerRoomSummary) {
  return room.contextMeta?.kind === "trade" ? room.contextMeta : null;
}

function deliveryMeta(room: CommunityMessengerRoomSummary) {
  return resolveCommunityMessengerDeliveryContextMeta(room);
}

/** 거래·배달 방이 거래/주문 완료 상태인지 (readonly·목록 정책 공통) */
export function isCommerceChatRoomCompleted(room: CommunityMessengerRoomSummary): boolean {
  const trade = tradeMeta(room);
  if (trade) {
    const flow = trimIso(trade.tradeFlowStatus);
    if (flow && TRADE_READONLY_FLOW_STATUSES.has(flow)) return true;
    const state = trimIso(trade.itemStateLabel);
    if (state && TRADE_COMPLETED_ITEM_STATE_LABELS.has(state)) return true;
  }
  const delivery = deliveryMeta(room);
  if (delivery) {
    const status = trimIso(delivery.orderStatus);
    if (status === "completed") return true;
    if (parseIsoMs(delivery.deliveryCompletedAt) != null) return true;
  }
  return false;
}

/** 완료 시각 앵커 — 명시 timestamp 필드만 사용 (추측 fallback 없음) */
export function getCommerceChatCompletionAnchorMs(room: CommunityMessengerRoomSummary): number | null {
  const trade = tradeMeta(room);
  if (trade) {
    return maxIsoMs([trade.completedAt, trade.sellerCompletedAt, trade.buyerConfirmedAt]);
  }
  const delivery = deliveryMeta(room);
  if (delivery) {
    return maxIsoMs([delivery.completedAt, delivery.deliveryCompletedAt]);
  }
  return null;
}

/** 완료 후 목록에서 숨길 시각(앵커 + 7일). 앵커 없으면 null */
export function getCompletedChatVisibleUntil(room: CommunityMessengerRoomSummary): Date | null {
  const anchor = getCommerceChatCompletionAnchorMs(room);
  if (anchor == null) return null;
  return new Date(anchor + COMPLETED_CHAT_LIST_VISIBLE_MS);
}

/** 완료 거래·주문 — 입력 readonly 와 목록 completed UI */
export function isCompletedChatReadonly(room: CommunityMessengerRoomSummary): boolean {
  if (room.roomStatus === "archived") return true;
  if (room.isReadonly) return true;
  return isCommerceChatRoomCompleted(room);
}

/** 완료 후 7일 초과 시 목록에서 제외. `room_status='archived'` 도 제외 */
export function shouldHideCompletedChatFromList(
  room: CommunityMessengerRoomSummary,
  nowMs: number = Date.now()
): boolean {
  if (room.roomStatus === "archived") return true;
  if (!isCommerceChatRoomCompleted(room)) return false;
  const anchor = getCommerceChatCompletionAnchorMs(room);
  if (anchor == null) return false;
  return nowMs - anchor > COMPLETED_CHAT_LIST_VISIBLE_MS;
}

/** pillar 목록·요약 공통 — 보여줄 방인지 */
export function shouldShowCommerceChatInList(
  room: CommunityMessengerRoomSummary,
  nowMs: number = Date.now()
): boolean {
  return !shouldHideCompletedChatFromList(room, nowMs);
}

/** dedupe 전 목록 노출 필터 + dedupe 후 유지할 room id 집합 */
export function pickVisibleDedupedCommerceRoomIds(
  rooms: CommunityMessengerRoomSummary[],
  dedupe: (summaries: CommunityMessengerRoomSummary[]) => CommunityMessengerRoomSummary[],
  nowMs: number = Date.now()
): Set<string> {
  const visible = rooms.filter((r) => shouldShowCommerceChatInList(r, nowMs));
  return new Set(dedupe(visible).map((r) => r.id.trim()).filter(Boolean));
}
