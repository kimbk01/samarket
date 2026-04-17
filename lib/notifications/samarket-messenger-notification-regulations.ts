/**
 * SAMARKET 거래 + 메신저 + 알림 + 뱃지 **최종 정식 규정** (`notif-0002`).
 *
 * 이 파일이 단일 진실 원본(SSOT)이다. UI·사운드·브리지는 여기 정의와 어긋나면 버그로 본다.
 *
 * ---------------------------------------------------------------------------
 * [0. 절대 원칙]
 * ---------------------------------------------------------------------------
 * 1. 알림은 **1번만** 발생한다 (중복 금지).
 * 2. 거래 탭은 **대화 진입 화면이 아니다** (상품/판매 UI).
 * 3. 뱃지는 **눌렀을 때 바로 해결되는 화면**에만 준다 → **메신저 탭만** (하단 거래 탭 아이콘 금지).
 * 4. 거래 채팅은 **메신저에 포함**된다 (별도 알림 시스템 아님).
 * 5. **Admin** `admin_notification_settings` + 통화 설정이 알림음의 최종 제어권 (행별 `enabled`, 사용자 설정은 `notification-sound-gate`).
 *
 * ---------------------------------------------------------------------------
 * [1. 시스템 구조]
 * ---------------------------------------------------------------------------
 * 목표 `room_type`: `trade` | `direct` | `group` | `order` | `system`
 * (DB 완전 통합 전까지 레거시 `chatUnread` + `communityMessengerUnread` 병행 — 뱃지는 메신저 탭 한 곳에만 합산 표기)
 *
 * ---------------------------------------------------------------------------
 * [2. 탭 역할]
 * ---------------------------------------------------------------------------
 * - **메신저 탭**: 모든 채팅의 실제 진입점, unread 해결 공간, **뱃지 O**
 * - **거래 탭**: 상품/판매 화면, 채팅 해결 공간 아님, **탭 아이콘 뱃지 X**
 *
 * ---------------------------------------------------------------------------
 * [3. 뱃지]
 * ---------------------------------------------------------------------------
 * 허용: 메신저 탭 전체 unread, 채팅 리스트 room별, 메신저 내 거래 필터 subset
 * 금지: 거래 탭 아이콘 숫자, 메신저/거래 탭에 동일 숫자 중복
 * 거래 피드: 상품 카드에만 "새 메시지"·dot·"문의 있음" (별도 작업)
 *
 * ---------------------------------------------------------------------------
 * [4. 알림]  `ALERT_SOURCE = "messenger_only"`
 * ---------------------------------------------------------------------------
 * CASE 1 OFF_APP — 푸시 + 소리 + 뱃지(메신저 탭 합산)
 * CASE 2 같은 방 — 무알림, unread 증가 없음, 즉시 read
 * CASE 3 다른 방 — 알림 1회, 메신저 경로 소리
 * CASE 4 채팅 리스트 — 알림 1회 + 토스트
 * CASE 5 **거래 탐색 화면** (`isTradeFloatingMenuSurface`) — 논리적 알림 1회에 맞추되 **인앱 소리 금지**, 상품 카드 상태만 (소스는 메신저 Realtime)
 *
 * ---------------------------------------------------------------------------
 * [5. 거래 채팅]
 * ---------------------------------------------------------------------------
 * room key: trade_item_id + buyer_id + seller_id — 동일 조합 재사용 (DB 규칙)
 *
 * ---------------------------------------------------------------------------
 * [6. 알림음 · Admin 연동]
 * ---------------------------------------------------------------------------
 * Admin: `/admin/settings/notifications` → `GET /api/app/notification-sound-config` → `playDomainNotificationSound`
 * 도메인 매핑: `SAMARKET_ROOM_TYPE_TO_NOTIFICATION_DOMAIN`
 * 통화 링: `GET /api/app/messenger-call-sound-config` (별도 테이블)
 * `enabled === false` (해당 타입 행) → 무음. 2초 debounce: `MESSENGER_CHAT_ALERT_MIN_GAP_MS` / `UNIFIED_IN_APP_CHAT_SOUND_MIN_GAP_MS`
 *
 * ---------------------------------------------------------------------------
 * [7–11] 읽음 · 통화 · UI 금지 · 테스트
 * ---------------------------------------------------------------------------
 * 읽음: 방 진입·같은 방 수신 시 즉시 read; **blur 시 read 금지** (기존 mark-read effect)
 * 통화: 기존 방 이벤트로만 기록, 통화 전용 채팅방 생성 금지
 * 금지: 거래+메신저 동시 소리, 중복 뱃지, 페이지마다 분산 알림 로직
 *
 * @see lib/notifications/unified-messenger-trade-alert-contract.ts
 * @see lib/community-messenger/notifications/messenger-notification-contract.ts
 */

import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";

export const SAMARKET_NOTIFICATION_REGULATION_ID = "notif-0002" as const;

/** §4 — 인앱 메시지 알림의 단일 제품 축 */
export const SAMARKET_ALERT_SOURCE = "messenger_only" as const;
export type SamarketAlertSource = typeof SAMARKET_ALERT_SOURCE;

/** §1 목표 room_type (스키마 통합 후 DB와 1:1) */
export type SamarketCanonicalRoomType = "trade" | "direct" | "group" | "order" | "system";

/**
 * §6 — conceptual room_type → `admin_notification_settings.type` / `NotificationDomain`
 * (통화 수신 벨은 `admin_messenger_call_sound_settings` — 여기엔 `system` 을 community_chat 폴백으로만 문서화)
 */
export const SAMARKET_ROOM_TYPE_TO_NOTIFICATION_DOMAIN: Record<
  SamarketCanonicalRoomType,
  NotificationDomain
> = {
  trade: "trade_chat",
  direct: "community_direct_chat",
  group: "community_group_chat",
  order: "order",
  system: "community_chat",
};

/**
 * §3 + 레거시 병행: 메신저 탭에 표시할 **전체 채팅 미읽음** (거래 레거시 허브 + 메신저 참가자).
 * DB 통합 후 `communityMessengerUnread` 단일 필드만 쓰도록 이 함수 본문만 축소하면 된다.
 */
export function resolveMessengerTabTotalUnreadBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return (
    Math.max(0, Math.floor(Number(bd.communityMessengerUnread) || 0)) +
    Math.max(0, Math.floor(Number(bd.chatUnread) || 0))
  );
}

/**
 * §2 §3 — 하단 **거래** 탭 아이콘: 미읽음 숫자 **항상 0** (금지).
 */
export function resolveBottomNavTradeTabBadgeCount(_bd: OwnerHubBadgeBreakdown): number {
  return 0;
}

/** @deprecated 메신저 탭은 `resolveMessengerTabTotalUnreadBadgeCount` 사용 */
export function resolveBottomNavMessengerTabBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return resolveMessengerTabTotalUnreadBadgeCount(bd);
}

/** 내정보 등 “채팅 미읽음 요약” — 메신저 탭과 동일 합산 */
export function resolveUnifiedChatUnreadHintForDashboard(bd: OwnerHubBadgeBreakdown): number {
  return resolveMessengerTabTotalUnreadBadgeCount(bd);
}

/**
 * §5 CASE 5 — 거래 **탐색** 표면(홈·마켓·거래 숏컷)에서는 **인앱 채팅 알림음**을 내지 않는다.
 * (토스트·데스크톱·뱃지는 메신저 정책이 담당)
 */
export function shouldSuppressMessengerInAppSoundOnTradeExplorationSurface(
  pathname: string | null | undefined
): boolean {
  return isTradeFloatingMenuSurface(pathname);
}

/**
 * §11 수동 QA
 */
export const SAMARKET_NOTIFICATION_QA_CHECKLIST: readonly string[] = [
  "trade_message: single_alert_path_only",
  "trade_tab_icon: no_badge",
  "trade_feed: no_in_app_chat_sound",
  "messenger_tab: badge_matches_total_unread",
  "same_room: silent_no_unread_bump",
  "other_room: single_sound_coalesced",
  "admin_sound_disabled: silent_no_beep",
  "mute: no_sound_badge_may_update",
  "calls: logged_on_existing_room_not_new_room",
] as const;
