/**
 * Community 메신저 — 알림·뱃지·읽음 **제품 규칙(계약)**.
 *
 * @see lib/notifications/samarket-messenger-notification-regulations.ts — `notif-0002` (거래 탭 뱃지 금지·메신저 단일 알림·CASE 5 무음)
 *
 * 구현 분기는 `messenger-message-notification-policy.ts`(순수 함수),
 * 런타임 연결은 `use-message-notification-bridge.ts`·`messenger-web-desktop-notification.ts` 등에서 수행한다.
 *
 * ---------------------------------------------------------------------------
 * 사용자 상태 (요약)
 * ---------------------------------------------------------------------------
 * - OFF-APP: 탭 숨김 / 백그라운드 (`document.visibilityState !== "visible"`).
 * - IN-APP: 포그라운드.
 * - 채팅 목록: `/community-messenger` (목록·친구 등 메신저 표면).
 * - 특정 방: `/community-messenger/rooms/[roomId]`.
 * - 동일 방 활성: `NotificationSurface.activeCommunityChatRoomId === 수신 roomId`.
 * - 창 포커스: `NotificationSurface.isWindowFocused` + `document.hasFocus()` (레거시 분기).
 *
 * ---------------------------------------------------------------------------
 * 인앱 알림음 (`playCoalescedChatNotificationSound`)
 * ---------------------------------------------------------------------------
 * - 동일 방 + 포그라운드 + 창 포커스 + 타임라인 하단 근처: **무음** (DB unread 는 서버 RPC).
 * - 동일 방 + 포그라운드 + 포커스 + 스크롤 위: **무음** (방 UI에서 “새 메시지” 표시).
 * - 동일 방 + 포그라운드 + **창 blur**: **톤 허용** (탭은 메신저이나 다른 창을 보는 경우).
 * - 백그라운드: **톤 허용** (뮤트·알림 설정 제외).
 * - 그 외 화면/다른 방: **톤 + 앱 레벨 배너**(rollout 시).
 * - 연속 수신: `MESSENGER_CHAT_ALERT_MIN_GAP_MS` ms 안에서는 **1회만** 재생(키·방향 무관).
 *
 * ---------------------------------------------------------------------------
 * 하단 탭 「메신저」뱃지 (`communityMessengerUnread`)
 * ---------------------------------------------------------------------------
 * - 소스 오브 트루스: 서버 `GET /api/me/store-owner-hub-badge` 집계(DB `community_messenger_participants`).
 * - 클라이언트는 **OS Badging API(`setAppBadge`)로 방 단위 unread 를 쓰지 않는다**(참가자 행 1건과 혼동 방지).
 * - Realtime·읽음·알림 클릭 후 갱신: `requestMessengerHubBadgeResync(reason)` 단일 경로만 사용.
 *
 * ---------------------------------------------------------------------------
 * 읽음 (`mark_read`)
 * ---------------------------------------------------------------------------
 * - 하단 체류 읽음: `use-messenger-room-open-mark-read-effect` — 가시성 + **창 포커스** + 스티키 하단.
 * - 데스크톱 알림 클릭: `PATCH ... mark_read` 후 방 이동 + 허브 뱃지 resync.
 *
 * @see messenger-message-notification-policy.ts
 * @see use-message-notification-bridge.ts
 * @see lib/notifications/unified-messenger-trade-alert-contract.ts — 메신저+거래 통합 알림 규격·허브 스냅샷 거래 톤 억제
 */

import {
  dispatchOwnerHubBadgeRefresh,
  KASAMA_OWNER_HUB_BADGE_REFRESH,
} from "@/lib/chats/chat-channel-events";

/** `playCoalescedChatNotificationSound` 와 동일 값 — 한 곳에서만 정의 */
export const MESSENGER_CHAT_ALERT_MIN_GAP_MS = 2000;

/** 허브 배지 강제 재조회 트리거 — `owner-hub-badge-store` 가 구독 */
export const MESSENGER_OWNER_HUB_BADGE_RESYNC_EVENT = KASAMA_OWNER_HUB_BADGE_REFRESH;

export type MessengerHubBadgeResyncReason =
  /** Realtime `community_messenger_participants`·읽음 등으로 탭 배지가 바뀔 수 있을 때 */
  | "participant_unread_changed"
  | "notification_click_mark_read"
  | "room_phase2_mark_read"
  /** `useMessengerRoomOpenMarkReadEffect` — 뷰포트 가시 + 하단 체류 + 오버레이 없음 후 PATCH mark_read 성공 */
  | "room_open_mark_read"
  | "auth_signed_out";

export type MessengerHubBadgeResyncDetail = {
  source: "community_messenger";
  reason: MessengerHubBadgeResyncReason;
  at: number;
};

/**
 * 메신저 관련 변경 후 하단 탭 `communityMessengerUnread` 만 서버와 다시 맞춘다.
 * (이벤트 1종 — 기존 분산 `CustomEvent(KASAMA_OWNER_HUB_BADGE_REFRESH)` 호출을 이 함수로 통일)
 */
export function requestMessengerHubBadgeResync(reason: MessengerHubBadgeResyncReason): void {
  if (typeof window === "undefined") return;
  const detail: MessengerHubBadgeResyncDetail = {
    source: "community_messenger",
    reason,
    at: Date.now(),
  };
  dispatchOwnerHubBadgeRefresh({
    source: detail.source,
    key: reason,
    /** 250ms 기본 디듀프는 연속 unread 이벤트를 삼켜 하단 탭 배지가 늦게 맞는 원인 — 메신저는 즉시 전달 */
    dedupeMs: 0,
  });
}
