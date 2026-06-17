import type { MutableRefObject } from "react";
import type { MessengerChatViewPosition } from "@/lib/community-messenger/notifications/messenger-notification-state-model";
import { messengerRoomTracksScrollPosition } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import {
  messengerRoomDistanceFromBottom,
  isMessengerRoomNearBottomFromMetrics,
} from "@/lib/community-messenger/room/messenger-room-timeline-ssot";
import { logChatRoomScroll } from "@/lib/community-messenger/room/messenger-room-timeline-log";
import { MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX } from "@/lib/ui/messenger-chat-viewport-tuning";

export function readMessengerRoomNearBottomFromViewport(
  viewport: HTMLElement | null,
  thresholdPx = MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX
): { nearBottom: boolean; bottomDistancePx: number } | null {
  if (!viewport) return null;
  const scrollHeight = viewport.scrollHeight;
  const scrollTop = viewport.scrollTop;
  const clientHeight = viewport.clientHeight;
  const bottomDistancePx = Math.max(0, messengerRoomDistanceFromBottom({ scrollHeight, scrollTop, clientHeight }));
  return {
    nearBottom: isMessengerRoomNearBottomFromMetrics(
      { scrollHeight, scrollTop, clientHeight },
      thresholdPx
    ),
    bottomDistancePx,
  };
}

/**
 * viewport scroll metrics → stickToBottomRef + reader store.
 * 사용자·programmatic scroll·realtime ingest 직전 모두 이 경로만 사용한다.
 */
export function syncMessengerRoomStickToBottomFromViewport(input: {
  viewport: HTMLElement | null;
  stickToBottomRef: MutableRefObject<boolean>;
  roomId: string;
  activeSheet?:
    | null
    | "attach"
    | "attach-confirm"
    | "menu"
    | "members"
    | "info"
    | "search"
    | "media"
    | "files"
    | "links"
    | "stickers"
    | "emoji";
  /** scroll 이벤트 경로만 near_bottom_* 로그 출력 */
  emitScrollLogs?: boolean;
  lastScrollGeomRef?: MutableRefObject<{ sh: number; st: number; ch: number; ready: boolean }>;
}): boolean {
  const metrics = readMessengerRoomNearBottomFromViewport(input.viewport);
  if (!metrics) return input.stickToBottomRef.current;

  const { nearBottom, bottomDistancePx } = metrics;
  const prevNearBottom = input.stickToBottomRef.current;
  input.stickToBottomRef.current = nearBottom;

  const el = input.viewport;
  if (el && input.lastScrollGeomRef) {
    input.lastScrollGeomRef.current = {
      sh: el.scrollHeight,
      st: el.scrollTop,
      ch: el.clientHeight,
      ready: true,
    };
  }

  const id = input.roomId.trim();
  const roomIdSuffix = id.length > 8 ? id.slice(-8) : id;
  const thresholdPx = MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX;

  if (input.emitScrollLogs && prevNearBottom !== nearBottom) {
    logChatRoomScroll(nearBottom ? "near_bottom_true" : "near_bottom_false", {
      roomIdSuffix,
      bottomDistancePx,
      thresholdPx,
    });
  }

  if (!id || !messengerRoomTracksScrollPosition()) return nearBottom;

  let pos: MessengerChatViewPosition;
  if (input.activeSheet === "search") {
    pos = "jumped-by-search";
  } else if (nearBottom) {
    pos = "at-bottom";
    const pending = useMessengerRoomReaderStateStore.getState().byRoom[id]?.pendingNewBelow ?? 0;
    if (pending > 0 && input.emitScrollLogs) {
      logChatRoomScroll("new_messages_chip_hide", {
        roomIdSuffix,
        reason: "scrolled_to_bottom",
        previousCount: pending,
      });
    }
  } else {
    pos = "reading-history";
  }
  useMessengerRoomReaderStateStore.getState().setScrollPosition(id, pos);
  return nearBottom;
}

export function resolveMessengerRoomNearBottomForAutoScroll(input: {
  viewport: HTMLElement | null;
  stickToBottomRef: MutableRefObject<boolean>;
  roomId: string;
  lastScrollGeomRef?: MutableRefObject<{ sh: number; st: number; ch: number; ready: boolean }>;
  activeSheet?:
    | null
    | "attach"
    | "attach-confirm"
    | "menu"
    | "members"
    | "info"
    | "search"
    | "media"
    | "files"
    | "links"
    | "stickers"
    | "emoji";
  emitScrollLogs?: boolean;
}): boolean {
  const metrics = readMessengerRoomNearBottomFromViewport(input.viewport);
  if (metrics) {
    return syncMessengerRoomStickToBottomFromViewport({
      viewport: input.viewport,
      stickToBottomRef: input.stickToBottomRef,
      roomId: input.roomId,
      activeSheet: input.activeSheet,
      emitScrollLogs: input.emitScrollLogs,
      lastScrollGeomRef: input.lastScrollGeomRef,
    });
  }
  const id = input.roomId.trim();
  if (!id) return input.stickToBottomRef.current;
  const scrollPos = useMessengerRoomReaderStateStore.getState().getScrollPositionForPolicy(id);
  const nearBottom = scrollPos === "at-bottom" || scrollPos === "near-bottom";
  input.stickToBottomRef.current = nearBottom;
  return nearBottom;
}

export function logMessengerRoomNewMessagesChipShow(input: {
  roomId: string;
  delta: number;
  pendingTotal: number;
}): void {
  const id = input.roomId.trim();
  if (!id || input.delta <= 0) return;
  logChatRoomScroll("new_messages_chip_show", {
    roomIdSuffix: id.length > 8 ? id.slice(-8) : id,
    delta: input.delta,
    pendingTotal: input.pendingTotal,
  });
}

export function clearMessengerRoomPendingNewWithChipLog(input: {
  roomId: string;
  reason: string;
}): void {
  const id = input.roomId.trim();
  if (!id) return;
  const prev = useMessengerRoomReaderStateStore.getState().byRoom[id]?.pendingNewBelow ?? 0;
  if (prev > 0) {
    logChatRoomScroll("new_messages_chip_hide", {
      roomIdSuffix: id.length > 8 ? id.slice(-8) : id,
      reason: input.reason,
      previousCount: prev,
    });
  }
  useMessengerRoomReaderStateStore.getState().clearPendingNew(id);
}
