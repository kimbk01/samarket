import { estimateMessengerTimelineRowPx } from "@/lib/store-order-chat/messenger-timeline-row-estimate";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  resolveMessengerRoomTimelinePaintSource,
  type MessengerRoomTimelineMessage,
} from "@/lib/community-messenger/room/messenger-room-timeline-ssot";

export type MessengerRoomTimelineLayoutMode = "direct" | "virtual";

export type MessengerRoomTimelinePaintModel = {
  paintMessages: MessengerRoomTimelineMessage[];
  layoutMode: MessengerRoomTimelineLayoutMode;
  /** @deprecated use layoutMode */
  useDirectLayout: boolean;
};

/**
 * Telegram-style: virtual 은 tanstack 측정 완료 + 이 임계 이상일 때만.
 * 그 미만·측정 전은 direct(document flow). 추정 translateY absolute paint 금지.
 */
export const MESSENGER_TIMELINE_VIRTUAL_MIN_MESSAGES = 2501;

export function resolveMessengerRoomTimelineLayoutMode(input: {
  paintMessageCount: number;
  /** getVirtualItems() 측정 완료 — estimate fallback 아님 */
  virtualizerMeasuredReady?: boolean;
}): MessengerRoomTimelineLayoutMode {
  if (input.paintMessageCount <= 0) return "direct";
  if (input.paintMessageCount < MESSENGER_TIMELINE_VIRTUAL_MIN_MESSAGES) return "direct";
  if (input.virtualizerMeasuredReady === true) return "virtual";
  return "direct";
}

/**
 * 타임라인 paint 단일 경로 — Telegram contiguous flow 기본(direct).
 * DO NOT: virtual + buildMessengerRoomFallbackVirtualRows 로 화면 paint (call_stub gap 회귀).
 */
export function buildMessengerRoomTimelinePaintModel(input: {
  displayRoomMessages: MessengerRoomTimelineMessage[];
  roomMessages: MessengerRoomTimelineMessage[];
  loading: boolean;
  timelineInitialLoadComplete: boolean;
  snapshot: {
    messages?: MessengerRoomTimelineMessage[];
    room: Pick<CommunityMessengerRoomSnapshot["room"], "lastMessage">;
  } | null;
  hasStoreOrderDock: boolean;
  hasStoreOrderTimeline: boolean;
  virtualizerMeasuredReady?: boolean;
}): MessengerRoomTimelinePaintModel {
  const paintMessages = resolveMessengerRoomTimelinePaintSource({
    displayRoomMessages: input.displayRoomMessages,
    roomMessages: input.roomMessages,
    loading: input.loading,
    timelineInitialLoadComplete: input.timelineInitialLoadComplete,
    snapshot: input.snapshot,
  });

  void input.hasStoreOrderDock;
  void input.hasStoreOrderTimeline;
  const layoutMode = resolveMessengerRoomTimelineLayoutMode({
    paintMessageCount: paintMessages.length,
    virtualizerMeasuredReady: input.virtualizerMeasuredReady,
  });

  return {
    paintMessages,
    layoutMode,
    useDirectLayout: layoutMode === "direct",
  };
}

/** virtualizer getVirtualItems — pass/hydration cap 없이 전체 가시 윈도 */
export function selectMessengerRoomVirtualRows<T extends { index: number }>(items: T[]): T[] {
  return items;
}

/**
 * @deprecated render 금지 — estimate offset absolute 는 Telegram gap 위반.
 * 테스트·scrollHeight hint 용도만.
 */
export const MESSENGER_VIRTUAL_FALLBACK_TAIL_ROWS = 24;

export function estimateMessengerRoomTimelineTotalHeight(
  messages: ReadonlyArray<Pick<CommunityMessengerMessage, "messageType" | "content" | "metadata">>
): number {
  let total = 0;
  for (let i = 0; i < messages.length; i += 1) {
    total += estimateMessengerTimelineRowPx(messages[i]);
  }
  return total;
}

/** @deprecated UI render 에 사용 금지 — direct layout 또는 measured virtualItems 만 */
export function buildMessengerRoomFallbackVirtualRows(
  messages: ReadonlyArray<Pick<CommunityMessengerMessage, "messageType" | "content" | "metadata">>,
  opts?: { maxRows?: number }
): Array<{ index: number; start: number }> {
  const messageCount = messages.length;
  if (messageCount <= 0) return [];
  const maxRows = Math.max(1, opts?.maxRows ?? MESSENGER_VIRTUAL_FALLBACK_TAIL_ROWS);
  const startIndex = Math.max(0, messageCount - maxRows);
  const rows: Array<{ index: number; start: number }> = [];
  let offset = 0;
  for (let i = 0; i < startIndex; i += 1) {
    offset += estimateMessengerTimelineRowPx(messages[i]);
  }
  for (let i = startIndex; i < messageCount; i += 1) {
    rows.push({ index: i, start: offset });
    offset += estimateMessengerTimelineRowPx(messages[i]);
  }
  return rows;
}

/** roomMessages merge skip — bootstrap fingerprint 와 동일 패턴 */
export function roomMessagesTimelineFingerprint(
  messages: ReadonlyArray<{ id?: string; pending?: boolean; clientMessageId?: string | null }>
): string {
  if (messages.length === 0) return "0|";
  const tail = messages[messages.length - 1];
  const tailId = String(tail?.id ?? "");
  const tailCid = String(tail?.clientMessageId ?? "");
  const pendingCount = messages.filter((m) => m.pending).length;
  return `${messages.length}|${tailId}|${tailCid}|p${pendingCount}`;
}
