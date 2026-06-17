import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  hasMessengerRoomTimelineLoadHint,
  isMessengerRoomTimelineBootstrapSeedComplete,
} from "@/lib/community-messenger/room/messenger-room-timeline-hydration";

export type MessengerRoomTimelineMessage = CommunityMessengerMessage & { pending?: boolean };

/** 타임라인 행 dedupe·virtual key — `type:id` */
export function messengerRoomTimelineItemKey(message: MessengerRoomTimelineMessage): string {
  const id = String(message.id ?? "").trim() || "unknown";
  const type = String(message.messageType ?? "text").trim() || "text";
  return `${type}:${id}`;
}

/** created_at ASC, tie-breaker id ASC (pending 는 동일 시각에서 tail) */
export function sortMessengerRoomTimelineMessages(
  messages: MessengerRoomTimelineMessage[]
): MessengerRoomTimelineMessage[] {
  return [...messages].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    if (Boolean(a.pending) !== Boolean(b.pending)) return a.pending ? 1 : -1;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

/** scrollHeight - scrollTop - clientHeight */
export function messengerRoomDistanceFromBottom(input: {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}): number {
  return input.scrollHeight - input.scrollTop - input.clientHeight;
}

/** scrollHeight - scrollTop - clientHeight <= threshold */
export function isMessengerRoomNearBottomScroll(
  el: HTMLElement,
  thresholdPx: number
): boolean {
  return isMessengerRoomNearBottomFromMetrics(
    { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop, clientHeight: el.clientHeight },
    thresholdPx
  );
}

export function isMessengerRoomNearBottomFromMetrics(
  metrics: { scrollHeight: number; scrollTop: number; clientHeight: number },
  thresholdPx: number
): boolean {
  return messengerRoomDistanceFromBottom(metrics) <= thresholdPx;
}

/**
 * Phase2 타임라인 paint 단일 소스 — `snapshot.messages` 직접 fallback 금지.
 * roomMessages/displayRoomMessages 가 SSOT; incomplete seed 는 skeleton 까지 빈 배열.
 */
export function resolveMessengerRoomTimelinePaintSource(input: {
  displayRoomMessages: MessengerRoomTimelineMessage[];
  roomMessages: MessengerRoomTimelineMessage[];
  loading: boolean;
  timelineInitialLoadComplete: boolean;
  snapshot: {
    messages?: MessengerRoomTimelineMessage[];
    room: Pick<CommunityMessengerRoomSnapshot["room"], "lastMessage">;
  } | null;
}): MessengerRoomTimelineMessage[] {
  if (input.displayRoomMessages.length > 0) {
    return sortMessengerRoomTimelineMessages(input.displayRoomMessages);
  }
  if (input.roomMessages.length > 0) {
    return sortMessengerRoomTimelineMessages(input.roomMessages);
  }

  const hasHint = hasMessengerRoomTimelineLoadHint({
    roomMessagesLength: input.roomMessages.length,
    snapshotMessagesLength: input.snapshot?.messages?.length ?? 0,
    lastMessage: input.snapshot?.room.lastMessage,
  });

  if (!input.timelineInitialLoadComplete && hasHint) {
    return [];
  }

  if (
    input.timelineInitialLoadComplete &&
    input.snapshot &&
    isMessengerRoomTimelineBootstrapSeedComplete(input.snapshot)
  ) {
    return [];
  }

  return [];
}

/** initial fetch 완료 판정 — loaded + (히스토리 있음 | 신규 빈 방 | 로딩 종료) */
export function computeMessengerRoomTimelineInitialLoadComplete(input: {
  loaded: boolean;
  loading: boolean;
  roomMessages: MessengerRoomTimelineMessage[];
  snapshot: {
    messages?: MessengerRoomTimelineMessage[];
    room: Pick<CommunityMessengerRoomSnapshot["room"], "lastMessage">;
  } | null;
}): boolean {
  if (!input.loaded || input.loading) return false;

  const hasHint = Boolean(input.snapshot?.room.lastMessage?.trim());
  const hasPersistedMessages = input.roomMessages.some((m) => !m.pending);
  if (hasPersistedMessages) return true;
  if (!hasHint) return true;

  if (input.snapshot && !isMessengerRoomTimelineBootstrapSeedComplete(input.snapshot)) {
    return false;
  }

  const snapMsgCount = input.snapshot?.messages?.length ?? 0;
  if (snapMsgCount > 0 && !hasPersistedMessages) {
    return false;
  }

  return true;
}
