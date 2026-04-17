/**
 * message.created / participant.unread 증가 등 — 인앱 사운드·배너·unread 반영 여부 (순수 함수).
 *
 * @see lib/notifications/samarket-messenger-notification-regulations.ts
 * 푸시·OS 배지는 서버/ SW 경로에서 동일 스냅샷 타입을 쓰도록 확장한다.
 *
 * @see messenger-notification-contract.ts 제품 규칙·탭 뱃지 resync 단일 진입점
 *
 * 상태 기준(요약):
 * - 탭/앱이 백그라운드(`appVisibility !== foreground`) → 톤 허용(뮤트·설정 제외).
 * - 동일 방 URL + 포그라운드 + 창 포커스 + 하단 스크롤 → 톤·앱배너 없음(DB unread 는 서버가 관리, UI 는 방 클라이언트).
 * - 동일 방이지만 창 포커스 없음(blur) → 톤 허용(탭은 메신저 방이나 다른 창을 보는 경우).
 * - 다른 방 / 목록 / 기타 화면 → 톤·배너 허용.
 */

import type { MessengerCallStatus } from "@/lib/community-messenger/stores/useCallStore";
import type {
  MessengerAppVisibility,
  MessengerChatViewPosition,
  MessengerNotificationRuntimeSnapshot,
  MessengerScreenContext,
} from "./messenger-notification-state-model";

export type MessengerMessageSideEffects = {
  /** 리스트에 즉시 반영 (실시간 메시지 페이로드가 있을 때) */
  appendToList: boolean;
  allowAutoStickToBottom: boolean;
  incrementCurrentRoomUnread: boolean;
  incrementRoomListUnread: boolean;
  incrementGlobalUnread: boolean;
  showRoomFloatingNewCount: boolean;
  floatingNewMessageDelta: number;
  showAppLevelBanner: boolean;
  playInAppMessageSound: boolean;
  requestOsPush: boolean;
  requestBadgeUpdate: boolean;
  /** `playCoalescedChatNotificationSound` 등에 전달 */
  dedupeKey: string;
};

const ZERO: MessengerMessageSideEffects = {
  appendToList: false,
  allowAutoStickToBottom: false,
  incrementCurrentRoomUnread: false,
  incrementRoomListUnread: false,
  incrementGlobalUnread: false,
  showRoomFloatingNewCount: false,
  floatingNewMessageDelta: 0,
  showAppLevelBanner: false,
  playInAppMessageSound: false,
  requestOsPush: false,
  requestBadgeUpdate: false,
  dedupeKey: "",
};

export function buildMessengerMessageDedupeKey(roomId: string, messageIdOrUnread: string | number): string {
  return `messenger-msg:${roomId}:${messageIdOrUnread}`;
}

/** pathname 만으로 대략적 화면 맥락 (searchParams 는 호출부에서 보강 가능) */
export function inferMessengerScreenContextFromPathname(pathname: string | null | undefined): MessengerScreenContext {
  const p = pathname ?? "";
  if (p.startsWith("/community-messenger/rooms/")) return "current-chat-room";
  if (p === "/community-messenger" || p.startsWith("/community-messenger?")) return "chat-list";
  if (p.includes("/community-messenger") && p.includes("friends")) return "friend-list";
  if (p.includes("community-messenger")) return "chat-list";
  return "other-screen";
}

function sameRoom(active: string | null, target: string): boolean {
  return Boolean(active && active === target);
}

function soundAllowed(s: MessengerNotificationRuntimeSnapshot): boolean {
  if (s.appNotificationMuted || s.roomMuted) return false;
  if (s.interruption === "dnd") return false;
  if (s.senderBlocked) return false;
  if (s.roomArchivedOrHidden) return false;
  if (s.quietHoursActive) return false;
  if (s.interruption === "in-call") return false;
  return true;
}

/**
 * 설계 표 기반 — 스냅샷이 완전할 때 message 수신 부가효과.
 * (실시간 INSERT 페이로드 유무는 호출부에서 appendToList 를 덮어쓸 수 있음)
 */
export function resolveMessengerMessageArrivalEffects(
  s: MessengerNotificationRuntimeSnapshot,
  opts: { messageId?: string | null; unreadTotalHint?: number | null }
): MessengerMessageSideEffects {
  const dedupe =
    opts.messageId != null && String(opts.messageId).trim()
      ? buildMessengerMessageDedupeKey(s.targetRoomId, String(opts.messageId).trim())
      : buildMessengerMessageDedupeKey(
          s.targetRoomId,
          opts.unreadTotalHint != null ? opts.unreadTotalHint : Date.now()
        );

  const inTargetRoom = sameRoom(s.activeCommunityRoomId, s.targetRoomId);
  const atBottom =
    s.chatViewPosition === "at-bottom" || s.chatViewPosition === "near-bottom";
  const readingHistory = s.chatViewPosition === "reading-history" || s.chatViewPosition === "manual-scroll-lock";

  /** 통화 수신 중 — 메시지 배너·톤은 정책상 후순위 (통화 UI가 최상위) */
  if (s.callState !== "idle" && s.callState !== "ended" && s.callState !== "declined" && s.callState !== "canceled" && s.callState !== "missed") {
    return { ...ZERO, dedupeKey: dedupe, appendToList: inTargetRoom };
  }

  if (s.appVisibility !== "foreground") {
    return {
      ...ZERO,
      dedupeKey: dedupe,
      incrementRoomListUnread: true,
      incrementGlobalUnread: true,
      requestOsPush: true,
      requestBadgeUpdate: true,
      appendToList: false,
    };
  }

  if (inTargetRoom && atBottom) {
    return {
      ...ZERO,
      dedupeKey: dedupe,
      appendToList: true,
      allowAutoStickToBottom: true,
      incrementCurrentRoomUnread: false,
      incrementRoomListUnread: false,
      incrementGlobalUnread: false,
      showRoomFloatingNewCount: false,
      playInAppMessageSound: soundAllowed(s) ? false : false,
      showAppLevelBanner: false,
    };
  }

  if (inTargetRoom && readingHistory) {
    return {
      ...ZERO,
      dedupeKey: dedupe,
      appendToList: true,
      allowAutoStickToBottom: false,
      incrementCurrentRoomUnread: false,
      incrementRoomListUnread: false,
      incrementGlobalUnread: false,
      showRoomFloatingNewCount: true,
      floatingNewMessageDelta: 1,
      playInAppMessageSound: soundAllowed(s),
      showAppLevelBanner: false,
    };
  }

  if (inTargetRoom && s.chatViewPosition === "jumped-by-search") {
    return {
      ...ZERO,
      dedupeKey: dedupe,
      appendToList: true,
      allowAutoStickToBottom: false,
      showRoomFloatingNewCount: true,
      floatingNewMessageDelta: 1,
      playInAppMessageSound: soundAllowed(s),
    };
  }

  if (s.screenContext === "other-chat-room" || (s.screenContext === "current-chat-room" && !inTargetRoom)) {
    return {
      ...ZERO,
      dedupeKey: dedupe,
      incrementRoomListUnread: true,
      incrementGlobalUnread: true,
      showAppLevelBanner: true,
      playInAppMessageSound: soundAllowed(s),
    };
  }

  if (s.screenContext === "chat-list" || s.screenContext === "friend-list") {
    return {
      ...ZERO,
      dedupeKey: dedupe,
      incrementRoomListUnread: true,
      incrementGlobalUnread: true,
      playInAppMessageSound: soundAllowed(s),
    };
  }

  return {
    ...ZERO,
    dedupeKey: dedupe,
    incrementRoomListUnread: true,
    incrementGlobalUnread: true,
    showAppLevelBanner: true,
    playInAppMessageSound: soundAllowed(s),
  };
}

/**
 * `community_messenger_participants` unread 증가만 알 때 — 사운드·배너 (인앱).
 * Realtime 행에는 메시지 본문이 없어, 스크롤·CASE 1 세분화는 message 이벤트 경로에서 보강한다.
 * 동일 방·포그라운드·창 포커스면 기본 무음; 스크롤이 하단이 아니면(`sameRoomScrollHint`) 톤·배너 유지 생략.
 * 메시지 INSERT 경로 `notifyMessengerHomeRealtimeMessageInsert` 는 동일 방·포그라운드일 때 낙관 bump 도 생략한다.
 */
const STICKY_CHAT_VIEW: MessengerChatViewPosition[] = ["at-bottom", "near-bottom"];

export function resolveParticipantUnreadDeltaInAppEffects(input: {
  targetRoomId: string;
  nextUnread: number;
  prevUnread: number;
  activeCommunityRoomId: string | null;
  appVisibility: MessengerAppVisibility;
  roomMuted?: boolean;
  /** 인앱 메시지 톤만 억제 (배너는 `roomMuted`·정책에 따라 별도) */
  suppressInAppMessageSound?: boolean;
  quietHoursActive?: boolean;
  /** 동일 방일 때 스크롤 위치(rollout 시) — 하단이면 완전 무음 */
  sameRoomScrollHint?: MessengerChatViewPosition | null;
  applySameRoomScrollPolicy?: boolean;
  /** `NotificationSurface` — blur 시 동일 방이라도 톤 허용 */
  windowFocused?: boolean;
}): { playInAppMessageSound: boolean; showAppLevelBanner: boolean; dedupeKey: string } {
  if (!input.targetRoomId || input.nextUnread <= input.prevUnread) {
    return { playInAppMessageSound: false, showAppLevelBanner: false, dedupeKey: "" };
  }

  const dedupe = buildMessengerMessageDedupeKey(input.targetRoomId, input.nextUnread);

  const soundOff =
    input.roomMuted === true ||
    input.suppressInAppMessageSound === true ||
    input.quietHoursActive === true;

  const windowFocused = input.windowFocused !== false;

  if (input.appVisibility !== "foreground") {
    return {
      playInAppMessageSound: !soundOff,
      showAppLevelBanner: false,
      dedupeKey: dedupe,
    };
  }

  if (sameRoom(input.activeCommunityRoomId, input.targetRoomId)) {
    if (!windowFocused) {
      return {
        playInAppMessageSound: !soundOff,
        showAppLevelBanner: false,
        dedupeKey: dedupe,
      };
    }
    if (
      input.applySameRoomScrollPolicy &&
      input.sameRoomScrollHint != null &&
      !STICKY_CHAT_VIEW.includes(input.sameRoomScrollHint)
    ) {
      return {
        playInAppMessageSound: false,
        showAppLevelBanner: false,
        dedupeKey: dedupe,
      };
    }
    return { playInAppMessageSound: false, showAppLevelBanner: false, dedupeKey: dedupe };
  }

  return {
    playInAppMessageSound: !soundOff,
    showAppLevelBanner: true,
    dedupeKey: dedupe,
  };
}

function messengerCallStatusBlocksCommunityMessageDesktopNotify(status: MessengerCallStatus): boolean {
  return (
    status === "incoming" ||
    status === "outgoing" ||
    status === "connecting" ||
    status === "ringing" ||
    status === "active" ||
    status === "minimized"
  );
}

/**
 * `Notification` API (데스크톱 브라우저) — 탭 숨김·다른 방·다른 화면에서만 제안.
 * 권한·API 가용은 호출부(`tryShowMessengerWebDesktopNotification`)에서 처리.
 */
export function resolveMessengerWebDesktopNotificationIntent(input: {
  targetRoomId: string;
  nextUnread: number;
  prevUnread: number;
  activeCommunityRoomId: string | null;
  appVisibility: MessengerAppVisibility;
  windowFocused: boolean;
  communityChatEnabled: boolean;
  callStatus: MessengerCallStatus;
}): { allow: boolean; dedupeKey: string } {
  if (!String(input.targetRoomId ?? "").trim() || input.nextUnread <= input.prevUnread) {
    return { allow: false, dedupeKey: "" };
  }
  if (input.communityChatEnabled === false) {
    return { allow: false, dedupeKey: "" };
  }
  if (messengerCallStatusBlocksCommunityMessageDesktopNotify(input.callStatus)) {
    return { allow: false, dedupeKey: "" };
  }
  const inSameRoomForegroundFocused =
    sameRoom(input.activeCommunityRoomId, input.targetRoomId) &&
    input.appVisibility === "foreground" &&
    input.windowFocused;
  if (inSameRoomForegroundFocused) {
    return { allow: false, dedupeKey: "" };
  }
  return {
    allow: true,
    dedupeKey: buildMessengerMessageDedupeKey(input.targetRoomId, input.nextUnread),
  };
}
