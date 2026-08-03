/**
 * SAMARKET 거래 + 메신저 + 알림 + 뱃지 — Legacy Authority (`notif-0002` Legacy 정렬).
 *
 * BottomNav badge SSOT: **Chat tab only** (unread room count). Feed tabs (community/trade/stores)
 * show **no** notification_events SUM — causes live in tier1 bell / FAB / chat row.
 *
 * ---------------------------------------------------------------------------
 * [0. 절대 원칙]
 * ---------------------------------------------------------------------------
 * 1. 알림은 **1번만** 발생한다 (중복 금지).
 * 2. BottomNav feed 탭 = 도메인 피드/browse 진입만 — 탭 badge 없음.
 * 3. 도메인 알림 원인 = tier1 종 / FAB / 해당 채팅 row.
 * 4. Chat tab ≠ App icon total (단위가 다를 수 있음 — 정상).
 * 5. **Admin** 알림음 SSOT + `notification-sound-gate` (이 파일에서 Sound registry 수정 금지).
 *
 * ---------------------------------------------------------------------------
 * [1. Badge 단위 — Legacy]
 * ---------------------------------------------------------------------------
 * - **Chat 탭**: unread **room** count (`communityMessengerUnread` / `bottom_nav_chat`).
 * - **Chat row**: room `participants.unread_count` (message count).
 * - **Community / Trade / Stores 탭**: BottomNav badge **0** (events SUM 금지).
 * - **Community 원인**: tier1 `bottom_nav_community` 종 + 게시글 진입 clear.
 * - **Trade 원인**: tier1 `bottom_nav_my` 종 + 거래 채팅 row unread.
 * - **Delivery 원인**: tier1 `bottom_nav_delivery` 종 + FAB 주문내역/주문채팅.
 * - **App icon**: general/group + trade + store_order unread room projection
 *   + orphan missed call — event category SUM 금지, BottomNav와 독립.
 *
 * ---------------------------------------------------------------------------
 * [2. 탭 역할]
 * ---------------------------------------------------------------------------
 * - **메신저(Chat) 탭**: 일반 1:1 + 그룹만. trade/store_order/community 미포함.
 * - **거래 탭**: 거래 피드 (`/market`). 알림은 종·거래 채팅 row.
 * - **배달/매장 탭**: 매장 browse (`/stores`). 알림은 FAB·주문 상세.
 * - **커뮤니티 탭**: Philife 피드. 알림은 상단 종.
 *
 * ---------------------------------------------------------------------------
 * [3. 폐기 (혼용 금지)]
 * ---------------------------------------------------------------------------
 * - Chat tab = chat_message + group_message event SUM — **폐기**.
 * - BottomNav community/trade/stores = notification_events SUM — **폐기** (2026-07-08).
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
 * room key: trade_item_id + buyer_id + seller_id. Badge 원인은 tier1 종·거래 채팅 row.
 *
 * @see docs/dibay-notification-badge-number-policy.md
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
 * Chat 탭: unread **room** count = Bottom Chat
 * (일반+그룹+거래+주문(고객); owner ops / owner chat rooms excluded).
 * DO NOT substitute notification_events chat/group message SUM.
 */
export function resolveMessengerTabTotalUnreadBadgeCount(bd: OwnerHubBadgeBreakdown): number {
  return Math.max(0, Math.floor(Number(bd.communityMessengerUnread) || 0));
}

/**
 * Trade BottomNav tab — Legacy: always 0. Trade causes in tier1 bell / trade chat row.
 */
export function resolveBottomNavTradeTabBadgeCount(_bd?: OwnerHubBadgeBreakdown): number {
  return 0;
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
 * 거래 **탐색** 표면(`/market` 등) — **거래 채팅(trade_chat)** 인앱 톤 억제용.
 *
 * general_direct / group(community messenger) 알림음에는 사용하지 않는다.
 * CM 억제 기준: 현재 방 · 방/앱 음소거 · silent delivery · 중복 스케줄
 * (`pathname === "/market"` 만으로 CM 음을 막지 말 것).
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
  "trade_feed: trade_chat_tone_suppressed_cm_tone_allowed",
  "messenger_tab: badge_unread_room_count",
  "same_room: silent_no_unread_bump",
  "other_room: single_sound_coalesced",
  "admin_sound_disabled: silent_no_beep",
  "mute: no_sound_badge_may_update",
  "calls: logged_on_existing_room_not_new_room",
] as const;
