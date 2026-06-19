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
  /** @deprecated use layoutMode — store-order direct only */
  useDirectLayout: boolean;
};

/**
 * 타임라인 paint 단일 경로 — tail slice·direct→virtual upgrade 없음.
 * store-order/delivery 만 direct DOM(기존 제품 계약). 그 외 seed/cache 있으면 처음부터 virtual.
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
}): MessengerRoomTimelinePaintModel {
  const paintMessages = resolveMessengerRoomTimelinePaintSource({
    displayRoomMessages: input.displayRoomMessages,
    roomMessages: input.roomMessages,
    loading: input.loading,
    timelineInitialLoadComplete: input.timelineInitialLoadComplete,
    snapshot: input.snapshot,
  });

  const storeOrderDirect = input.hasStoreOrderDock || input.hasStoreOrderTimeline;
  const layoutMode: MessengerRoomTimelineLayoutMode =
    storeOrderDirect && paintMessages.length > 0 ? "direct" : "virtual";

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

/** virtualizer 첫 측정 전 DOM fallback — tail만 paint (대형 방 O(n) 렌더 방지) */
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
