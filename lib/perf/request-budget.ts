/**
 * K1 — 요청 예산 단일 정의 (SSOT). 사람용 문서: docs/request-budget-ssot.md
 * 설계: docs/audit/supabase-request-surge-2026-11-18/fundamental-countermeasure-design.md
 *
 * 라우트 예산 = API 요청 1회당 Supabase 호출 수(평균) 상한.
 * 초깃값은 운영 측정(2026-11-17 12:00 ~ 11-18 12:00 PHT, Vercel `external_api_request` ÷ `request.count`)을
 * 소수 첫째 자리 올림한 값이다. **내리기만 한다**(줄인 PR 이 같은 PR 에서 값을 낮춘다). 올리려면 Owner 승인.
 */

/** 라우트 경로(Next 앱 라우트 표기) → 요청 1회당 Supabase 호출 상한 */
export const ROUTE_SUPABASE_CALL_BUDGET: Readonly<Record<string, number>> = {
  /** A1·F7·F7-b 이후 — 운영 11-19 00~12 UTC 3.36(Vercel 3,054/908) · 계수기 3.20 → 4.0 (재감사 E) */
  "/api/community-messenger/calls/sessions/incoming": 4.0,
  /** B3 — access cleared_at 재사용으로 participants 1회 제거(미적용 DB는 폴백, 상한은 내린 값 유지) */
  /** #496·D4 이후 — 운영 11-19 00~12 UTC 5.16(Vercel 6,103/1,182) · 계수기 5.52 → 6.0 (재감사 E) */
  "/api/community-messenger/rooms/[roomId]/messages": 6.0,
  "/api/community-messenger/rooms/[roomId]/bootstrap": 2.5,
  "/api/community-messenger/presence": 1.1,
  "/api/me/notifications/badge-count": 5.2,
  /** 2026-11-20 고정값 3개(주제·가져오기 계정·동네 id) 공유 캐시 — 실측 6.51(Supabase 만) → 예상 4.2 */
  "/api/philife/neighborhood-feed": 5.0,
  "/api/stores/home-feed": 10.5,
  "/api/community-messenger/calls/sessions/[sessionId]": 5.0,
  "/api/community-messenger/bootstrap": 12.0,
  "/api/me/notifications/room-read": 16.0,
  "/api/community-messenger/rooms/[roomId]": 15.5,
  "/api/community-messenger/friend-requests": 1.3,
  "/api/me/profile": 2.3,
  "/api/community-messenger/trade-chat-list-meta": 15.0,
  "/api/me/mandatory-address-gate": 2.9,
  "/api/cron/delivery-ads-schedule-transitions": 11.0,
  "/api/launch-intro/live": 3.0,
  "/api/me/notification-settings": 3.5,
  "/api/platform-popup/resolve": 2.4,
  "/api/me/settings": 1.9,
  "/api/moim": 2.6,
  "/api/favorites/list": 2.9,
  "/api/me/stores": 2.4,
  "/api/platform-promotion/reconcile-guest": 2.1,
  "/api/platform-popup/ptr-reveal": 2.1,
  "/api/community-messenger/calls/sessions/stale-cleanup": 2.7,
  "/api/app/notification-sound-ssot": 2.2,
  "/api/me/devices/register": 1.9,
  "/api/community-messenger/rooms/[roomId]/peer-relation": 3.1,
  "/api/auth/session": 1.8,
  "/api/philife/posts": 7.8,
  "/api/cron/store-order-accept-reminders": 1.0,
  "/api/cron/commerce-notification-push-handoff": 2.0,
  "/api/cron/notification-push-handoff": 1.0,
  "/api/cron/store-orders-accept-timeout": 1.0,
  "/api/me/notifications": 1.5,
  "/api/philife/neighborhood-topic-options": 1.5,
  "/api/home/store-menus": 2.2,
  "/api/cron/admin-notification-delivery": 4.0,
  "/api/community-messenger/friends": 5.8,
  "/api/cron/moim-schedules": 7.0,
  "/api/admin/inbox": 4.5,
  "/api/me/address-defaults": 1.1,
  "/api/app-settings": 1.0,
  "/api/app/startup-config": 1.0,
  "/api/me/store-owner-hub-badge": 1.0,
  "/api/admin/admin-bell": 3.6,
  "/api/community-messenger/home-sync": 5.0,
  "/api/cron/notification-campaigns-dispatch-scheduled": 2.0,
  "/api/cron/store-orders-sla-scan": 2.0,
  "/api/me/trade-presence/beacon": 0.9,
  "/api/support/category-settings": 1.0,
  "/api/cron/stores-discovery-schedule-transitions": 1.8,
  "/api/community-messenger/store-profile-thumbnail": 2.0,
  "/api/community-messenger/relations/privacy-lists": 2.1,
  "/api/community-messenger/monitoring/events": 0.9,
  "/api/moim/rooms": 2.6,
  "/api/me/signup-status": 1.9,
  /** 2026-11-24 채팅 영상 고아 정리(하루 1회) — 후보 RPC 1 + 삭제 1 + 감사 1(삭제 있을 때만). 실측 전 계산값 */
  "/api/cron/messenger-video-orphan-gc": 3.0,
};

/**
 * 2026-11-22 — 받는 사람 수에 비례하는 동작(보내기)의 예산: 「요청 1번당 + 단위 1개당」.
 * 키 = 라우트 + `@표지`(계수기 `tagSupabaseCallRequest`), 예: `"/api/community-messenger/rooms/[roomId]/messages@post"`.
 * 판정: 호출 > (perRequest × 요청 + perUnit × 단위 합) × 경보 배수. 단위 = `addSupabaseCallRequestUnits`(보내기 = 받는 사람 수).
 * 새로 나뉜 키라 값 없이 시작 — 7일 실측 뒤 넣는다(설계 M-6). 값 없는 동안은 `unbudgeted_route` 판정.
 */
export const ROUTE_SUPABASE_CALL_UNIT_BUDGET: Readonly<Record<string, { perRequest: number; perUnit: number }>> = {};

/** 라우트 1회당 호출 수가 예산 × 이 값을 넘으면 경보 */
export const ROUTE_BUDGET_ALERT_FACTOR = 1.2;

/** 하루 Supabase 호출 합계가 직전 7일 중앙값 × 이 값을 넘으면 경보 */
export const DAILY_TOTAL_ALERT_FACTOR = 1.5;

/** 직전 비교 일수 */
export const DAILY_TOTAL_BASELINE_DAYS = 7;

/** 예산이 없는 라우트가 하루 이 값 이상 Supabase 를 부르면 경보(새 라우트 등록 누락 감지) */
export const UNBUDGETED_ROUTE_DAILY_CALL_ALERT = 1_000;

/** 경보 판정에 쓸 최소 요청 수 — 요청이 너무 적은 라우트는 1회당 평균이 흔들려 제외 */
export const ROUTE_BUDGET_MIN_REQUESTS = 30;

export function routeSupabaseCallBudget(route: string): number | null {
  const v = ROUTE_SUPABASE_CALL_BUDGET[route];
  return typeof v === "number" ? v : null;
}
