/**
 * 홈 ⑤ 「내 진행 중」 응답 모양·판정 — 설계 v2 §3-6 (Owner 「v2대로 구현」 2026-11-26).
 * 서버(`/api/home/my-activity`)와 화면(`HomeMyActivity`)이 같이 쓴다.
 *
 * - 거래 중 = 내가 판매자이고 상품 상태가 협의 중·예약 중(`posts.seller_listing_state`) 이거나, 내가 예약 구매자(`reserved_buyer_id`)인
 *   판매 중(`status = active`) 상품. 메신저 거래방 「대화 중」으로 세지 않는다(문의 채팅까지 세는 오류 — v2 §0 W5).
 * - 주문 = 진행 중 단계(접수 대기~배달 중) 주문. 남은 시간 = 조리 완료 예정(`estimated_ready_at`)만 — 배달 도착 예상 값은 운영 0건이라 쓰지 않는다.
 */

export const HOME_MY_ACTIVITY_ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
] as const;

/** 「준비 n분」을 보여 줄 단계 — 조리 완료 전 */
export const HOME_MY_ACTIVITY_READY_STATUSES: ReadonlySet<string> = new Set(["accepted", "preparing"]);

export const HOME_MY_ACTIVITY_TRADE_STATES = ["negotiating", "reserved"] as const;

export type HomeMyActivityOrder = {
  count: number;
  /** 가장 최근 진행 중 주문 */
  id: string;
  storeName: string;
  status: string;
  fulfillment: string;
  readyAt: string | null;
};

export type HomeMyActivityTrade = {
  count: number;
  title: string;
  /** 1건 = 그 거래 채팅(없으면 상품) · 2건 이상 = 목록 */
  href: string;
};

export type HomeMyActivityResponse = {
  ok: true;
  order: HomeMyActivityOrder | null;
  trade: HomeMyActivityTrade | null;
};

/** 조리 완료까지 남은 분 (지났거나 값 없음·대상 단계 아님 = null) */
export function homeOrderReadyMinutes(o: Pick<HomeMyActivityOrder, "status" | "readyAt">, now: number): number | null {
  if (!o.readyAt || !HOME_MY_ACTIVITY_READY_STATUSES.has(o.status)) return null;
  const ms = Date.parse(o.readyAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(1, Math.ceil(ms / 60_000));
}
