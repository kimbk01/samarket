/**
 * SAMARKET 거래 + 메신저 + 알림 + 뱃지 — Rebuild Authority (`notif-0002` 개정).
 *
 * 이 파일이 BottomNav badge 단위 SSOT이다. Legacy(event SUM Chat / Trade=0)와 혼용하지 않는다.
 *
 * ---------------------------------------------------------------------------
 * [0. 절대 원칙]
 * ---------------------------------------------------------------------------
 * 1. 알림은 **1번만** 발생한다 (중복 금지).
 * 2. 하단 탭 badge = 그 탭에서 사용자가 **실제로 볼 수 있는 unread 원인 수**.
 * 3. Chat / Trade / Delivery / Community **원인 혼합·중복 카운트 금지**.
 * 4. Chat tab ≠ App icon total (단위가 다를 수 있음 — 정상).
 * 5. **Admin** 알림음 SSOT + `notification-sound-gate` (이 파일에서 Sound registry 수정 금지).
 *
 * ---------------------------------------------------------------------------
 * [1. Badge 단위 — Rebuild]
 * ---------------------------------------------------------------------------
 * - **Chat 탭**: unread **room** count (`communityMessengerUnread` / `bottom_nav_chat` =
 *   consumer `chat_room` only). DO NOT use `chat_message`+`group_message` event SUM.
 * - **Chat row**: room `participants.unread_count` (message count).
 * - **Trade 탭**: `trade_message` + `trade_status` event unread (Trade 화면에서 해결).
 * - **Stores/Delivery 탭**: `order_status` + `delivery_status` (+ owner policy).
 * - **Community 탭**: `community_activity` only.
 * - **App icon**: `notification_events` category total (event SUM) — Chat tab과 별개.
 *
 * ---------------------------------------------------------------------------
 * [2. 탭 역할]
 * ---------------------------------------------------------------------------
 * - **메신저(Chat) 탭**: 일반 1:1 + 그룹만. trade/store_order/community 미포함.
 * - **거래 탭**: 거래 미읽 원인(메시지·상태) 해결. 탭 아이콘 뱃지 O (Rebuild).
 * - **배달/매장 탭**: 주문·배달 unread 원인.
 * - **커뮤니티 탭**: Philife community_activity.
 *
 * ---------------------------------------------------------------------------
 * [3. 폐기 (혼용 금지)]
 * ---------------------------------------------------------------------------
 * - Chat tab = chat_message + group_message event SUM — **폐기**.
 * - Trade tab 아이콘 항상 0 (`notif-0002` 구 조항) — **폐기**.
 * - 거래 채팅 unread를 Chat tab에 합산 — **금지**.
 *
 * ---------------------------------------------------------------------------
 * [4. 알림음]
 * ---------------------------------------------------------------------------
 * Admin SSOT eventKey · `playDomainNotificationSound` — registry/resolver 본체 수정 금지.
 * 도메인 매핑: `SAMARKET_ROOM_TYPE_TO_NOTIFICATION_DOMAIN`
 *
 * ---------------------------------------------------------------------------
 * [5. 거래 채팅]
 * ---------------------------------------------------------------------------
 * room key: trade_item_id + buyer_id + seller_id. Badge 원인은 Trade 탭/상세.
 *
 * @see docs/dibay-notification-badge-number-policy.md
 * @see lib/notifications/unified-messenger-trade-alert-contract.ts
 * @see lib/community-messenger/notifications/messenger-notification-contract.ts
 */

import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { getNotificationBadgeCountSnapshot } from "@/lib/notifications/notification-badge-count-store";

export const SAMARKET_NOTIFICATION_REGULATION_ID = "notif-0002" as const;

/** §4 — 인앱 메시지 알림의 단일 제품 축 */
export const SAMARKET_ALERT_SOURCE = "messenger_only" as const;
export type SamarketAlertSource = typeof SAMARKET_ALERT_SOURCE;

/** §1 목표 room_type (스키마 통합 후 DB와 1:1) */
export type SamarketCanonicalRoomType = "trade" | "direct" | "group" | "order" | "system";

/**
 * conceptual room_type → `admin_notification_settings.type` / `NotificationDomain`
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
 * Chat 탭: unread **room/target** count (`bottom_nav_chat` = consumer `chat_room` only).
 * trade/delivery CM 방은 각각 `trade`·`buyer_order` target — Chat에 합산 금지.
 * DO NOT substitute notification_events chat/group message SUM.
 */
export function resolveMessengerTabTotalUnreadBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return Math.max(0, Math.floor(Number(bd.communityMessengerUnread) || 0));
}

/**
 * Trade 탭: Trade 영역에서 볼 수 있는 unread 원인 수
 * (`trade_message` + `trade_status`). 항상 0 정책은 폐기.
 */
export function resolveBottomNavTradeTabBadgeCount(_bd?: OwnerHubBadgeBreakdown): number {
  const snap = getNotificationBadgeCountSnapshot();
  if (!snap) return 0;
  return Math.max(0, (snap.tradeMessage ?? 0) + (snap.tradeStatus ?? snap.trade));
}

/** @deprecated 메신저 탭은 `resolveMessengerTabTotalUnreadBadgeCount` 사용 */
export function resolveBottomNavMessengerTabBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return resolveMessengerTabTotalUnreadBadgeCount(bd);
}

/** 내정보 등 “채팅 미읽음 요약” — 메신저 탭과 동일 (room count) */
export function resolveUnifiedChatUnreadHintForDashboard(bd: OwnerHubBadgeBreakdown): number {
  return resolveMessengerTabTotalUnreadBadgeCount(bd);
}

/**
 * 거래 **탐색** 표면(홈·마켓·거래 숏컷)에서는 **인앱 채팅 알림음**을 내지 않는다.
 */
export function shouldSuppressMessengerInAppSoundOnTradeExplorationSurface(
  pathname: string | null | undefined
): boolean {
  return isTradeFloatingMenuSurface(pathname);
}

/**
 * 수동 QA (Rebuild)
 */
export const SAMARKET_NOTIFICATION_QA_CHECKLIST: readonly string[] = [
  "trade_message: single_alert_path_only",
  "trade_tab_icon: badge_matches_trade_causes",
  "trade_unread: not_in_chat_tab",
  "trade_feed: no_in_app_chat_sound",
  "messenger_tab: badge_unread_room_count",
  "same_room: silent_no_unread_bump",
  "other_room: single_sound_coalesced",
  "admin_sound_disabled: silent_no_beep",
  "mute: no_sound_badge_may_update",
  "calls: logged_on_existing_room_not_new_room",
] as const;
