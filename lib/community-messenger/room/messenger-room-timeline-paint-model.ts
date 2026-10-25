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

type TimelineFingerprintMessage = {
  id?: string;
  pending?: boolean;
  clientMessageId?: string | null;
  content?: string | null;
  imageAlbumUrls?: ReadonlyArray<string> | null;
  imageOriginalUrl?: string | null;
  deletedForEveryoneAt?: string | null;
  callStatus?: string | null;
  fileName?: string | null;
  replyToMessageId?: string | null;
  replyPreviewText?: string | null;
  metadata?: unknown;
};

function fnv1aUpdate(hash: number, text: string): number {
  let h = hash;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 제자리 변경(앨범 필드 보강·통화 종료·삭제·상품권 상태·수정) 서명.
 * count/tail 만 보던 지문은 같은 id 행의 내용 변경을 "변화 없음"으로 판정해 보강 데이터를 버렸다.
 */
function roomMessagesContentSignature(messages: ReadonlyArray<TimelineFingerprintMessage>): string {
  let h = 2166136261;
  for (const m of messages) {
    const meta = m.metadata && typeof m.metadata === "object" ? (m.metadata as Record<string, unknown>) : null;
    const transfer = meta && typeof meta.transfer_status === "string" ? meta.transfer_status : "";
    const edited = meta && typeof meta.editedAt === "string" ? meta.editedAt : "";
    h = fnv1aUpdate(
      h,
      `${m.id ?? ""}\u0001${m.content ?? ""}\u0001${m.imageAlbumUrls?.length ?? 0}\u0001${m.imageOriginalUrl ?? ""}\u0001${
        m.deletedForEveryoneAt ?? ""
      }\u0001${m.callStatus ?? ""}\u0001${m.fileName ?? ""}\u0001${transfer}\u0001${edited}\u0001${
        /** D-14: 인용이 늦게 채워진 같은 id 행을 「변경 없음」으로 버리지 않는다 */
        m.replyToMessageId ?? ""
      }\u0001${m.replyPreviewText ?? ""}\u0002`
    );
  }
  return h.toString(36);
}

/** roomMessages merge skip — bootstrap fingerprint 와 동일 패턴 (+ 제자리 내용 서명) */
export function roomMessagesTimelineFingerprint(messages: ReadonlyArray<TimelineFingerprintMessage>): string {
  if (messages.length === 0) return "0|";
  const tail = messages[messages.length - 1];
  const tailId = String(tail?.id ?? "");
  const tailCid = String(tail?.clientMessageId ?? "");
  const pendingCount = messages.filter((m) => m.pending).length;
  return `${messages.length}|${tailId}|${tailCid}|p${pendingCount}|c${roomMessagesContentSignature(messages)}`;
}
