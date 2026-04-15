/**
 * 메신저 알림·배지·통화 수신 — 상태 모델 (순수 타입·상수).
 * 실제 분기는 `messenger-message-notification-policy.ts` 등에서 소비한다.
 */

/** A. 앱 가시성 — 웹은 `terminated` 를 직접 알 수 없어 푸시/SW 경로에서 별도 표기 */
export type MessengerAppVisibility = "foreground" | "background" | "terminated";

/** B. 화면 맥락 */
export type MessengerScreenContext =
  | "current-chat-room"
  | "other-chat-room"
  | "chat-list"
  | "friend-list"
  | "other-screen";

/** C. 채팅방 내 스크롤·포커스 */
export type MessengerChatViewPosition =
  | "at-bottom"
  | "near-bottom"
  | "reading-history"
  | "jumped-by-search"
  | "manual-scroll-lock";

/** D. 통화 상태 (시그널링 레이어와 동기화할 값) */
export type MessengerCallState =
  | "idle"
  | "incoming-voice"
  | "incoming-video"
  | "outgoing-voice"
  | "outgoing-video"
  | "connecting"
  | "ringing"
  | "connected"
  | "declined"
  | "canceled"
  | "missed"
  | "ended";

/** E. 사용자 방해·집중 상태 */
export type MessengerUserPresenceInterruption =
  | "normal"
  | "typing"
  | "recording-voice"
  | "viewing-image"
  | "in-call"
  | "app-muted"
  | "room-muted"
  | "dnd";

/** 정책 입력 스냅샷 — 런타임에 채워 넣는 부분집합 */
export type MessengerNotificationRuntimeSnapshot = {
  appVisibility: MessengerAppVisibility;
  screenContext: MessengerScreenContext;
  /** 현재 포커스된 커뮤니티 메신저 방 ID (URL 또는 explicit) */
  activeCommunityRoomId: string | null;
  /** 수신 이벤트가 가리키는 방 */
  targetRoomId: string;
  chatViewPosition: MessengerChatViewPosition;
  callState: MessengerCallState;
  interruption: MessengerUserPresenceInterruption;
  /** 방·글로벌 뮤트, 차단, 보관함 등 */
  roomMuted: boolean;
  appNotificationMuted: boolean;
  quietHoursActive: boolean;
  senderBlocked: boolean;
  roomArchivedOrHidden: boolean;
  isGroupRoom: boolean;
};

export function documentVisibilityToAppVisibility(
  state: DocumentVisibilityState | undefined | null
): MessengerAppVisibility {
  if (state === "visible") return "foreground";
  return "background";
}
