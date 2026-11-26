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
  /**
   * 2026-11-26 홈 슈퍼앱 개편 설계 v2 §3-6 「내 진행 중」 새 라우트. 실측 전 코드 계산값:
   * 로그인 확인 + 주문 1 + 숨긴 주문 1 + 매장 이름 1 + 상품 1 + 거래 채팅 1(거래 1건일 때) = 최대 6. 7일 뒤 Vercel 값으로 내린다.
   */
  "/api/home/my-activity": 6.0,
  /**
   * 2026-11-26 홈 telRING 최근 통화(설계 v2 §3-5·§6)가 첫 페이지를 부르게 되어 등록. 계수기 7일(11-19~26) 34호출/3요청 = 11.3 ·
   * 요청 1회 최대 16 — 표본 3건뿐이라 12.0 으로 두고 7일 뒤 Vercel 값으로 다시 맞춘다(내리기만).
   */
  "/api/community-messenger/calls": 12.0,
  /** 2026-11-20 고정값 3개 공유 캐시 → 5.0. 2026-11-26 #577 지역 이름 공유 · #592 차단·숨김 1조회 뒤 실측 3.74(Vercel 232/62, 11-25 09~24 UTC) → 4.0 */
  "/api/philife/neighborhood-feed": 4.0,
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
  /** 2026-11-27 광고 B-DB FB-12 — 하루 1회: DB 함수 1회 + 반려 건마다 언어 조회·알림(평소 0건) */
  "/api/cron/feed-ad-requests-review-expire": 1.0,
  "/api/launch-intro/live": 3.0,
  "/api/me/notification-settings": 3.5,
  "/api/platform-popup/resolve": 2.4,
  "/api/me/settings": 1.9,
  "/api/moim": 2.6,
  "/api/favorites/list": 2.9,
  "/api/me/stores": 2.4,
  "/api/platform-promotion/reconcile-guest": 2.1,
  "/api/platform-popup/ptr-reveal": 2.1,
  /** 2026-11-26 광고 감사 E 신설 — 코드 계산 10(상위노출 가격 1 · 배너 가격 1 · 매장 광고 설정 5 · 홈 선반 1 · 업종 정책 1 · 업종 1 · R-18·R-23), 운영 측정 전. 열 때 1회(고정 카드·고객센터 「광고 금액 확인」) */
  "/api/ads/pricing-guide": 13.0,
  "/api/community-messenger/calls/sessions/stale-cleanup": 2.7,
  /** 2026-11-26 D6 인스턴스 공유 캐시(1시간·관리자 저장 시 만료) — 전: 2.89(11-25 Vercel 260/90). 상한 계산: 하루 비는 횟수 ≤ 24 × 표 3 + 인증 키 ≈ 요청 90 에 1.0 → 1.2 (실측 전) */
  "/api/app/notification-sound-ssot": 1.2,
  "/api/me/devices/register": 1.9,
  "/api/community-messenger/rooms/[roomId]/peer-relation": 3.1,
  "/api/auth/session": 1.8,
  "/api/philife/posts": 7.8,
  "/api/cron/store-order-accept-reminders": 1.0,
  "/api/cron/commerce-notification-push-handoff": 2.0,
  "/api/cron/notification-push-handoff": 1.0,
  "/api/cron/store-orders-accept-timeout": 1.0,
  /** 고정 바닥 1단계(2026-11-26) — 자동 취소·독촉 예약 실행을 합침. 대기 주문 없으면 확인 읽기 1번 */
  "/api/cron/store-orders-minute-tick": 1.0,
  /** D4 매시 이상 감시(2026-11-26) — 집계 읽기 1번, 이상 시 알림 쓰기 */
  "/api/cron/hourly-anomaly-watch": 2.0,
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
  /** 2026-11-26 D (Owner 승인): #562 받은 알림 요약을 종에 합친 뒤 구조 값 — 인증 1 · 처리 대기 1 · 받은 알림 1 · 발송 상태 1. 실측 4.05(Vercel 304/75, 11-25 09~12 UTC) → 4.0 */
  "/api/admin/admin-bell": 4.0,
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
