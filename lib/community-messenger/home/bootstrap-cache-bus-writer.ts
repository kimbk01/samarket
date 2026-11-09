import {
  peekBootstrapCache,
  primeBootstrapCache,
} from "@/lib/community-messenger/bootstrap-cache";
import { applyHomeListPatch, findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import { applyHomeListSummaryPatchUnread } from "@/lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list";
import type { HomeListPatch, HomeListPatchSource } from "@/lib/community-messenger/home-list-patch";
import {
  projectRoomActivityToHomeList,
  wasRoomActivityEventProjected,
} from "@/lib/community-messenger/home/project-room-activity-to-home-list";
import {
  buildCommunityMessengerBusEventId,
  type MessengerBusEvent,
} from "@/lib/community-messenger/multi-tab-bus";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import { addBounded } from "@/lib/collections/bounded-collections";

export const BOOTSTRAP_CACHE_SYNC_HOST_WRITER_ID = "community-messenger-bootstrap-cache-sync-host";

export type BootstrapCacheWriteResult = {
  eventId: string;
  eventType: string;
  roomId: string | null;
  writerId: string;
  previousLastMessageAt: string | null;
  nextLastMessageAt: string | null;
  previousPreview: string | null;
  nextPreview: string | null;
  cacheWriteApplied: boolean;
  cacheWriteSkipReason: string | null;
};

let activeViewerUserId: string | null = null;
/**
 * 실시간 이벤트 중복 처리 방지 — 재전송·재구독으로 같은 이벤트가 다시 오는 창은 수 초~수 분이다.
 * 상한 없이 며칠 쌓이던 것을 최근 2,000건으로 제한. 같은 이벤트의 중복 수신(여러 채널·재구독)은 수 초 안에 온다 —
 * 2,000건 뒤에 같은 ID 가 다시 오는 경로는 확인되지 않았다(타일 투영은 projection-authority 의 별도 상한 dedupe 도 거친다).
 */
const PROCESSED_EVENT_IDS_MAX = 2_000;
const processedEventIds = new Set<string>();
let cacheWriteCountForTests = 0;

function lastEventAtMs(iso: string | null | undefined): number {
  const ms = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function logBootstrapCacheWrite(result: BootstrapCacheWriteResult): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console -- bootstrap cache owner diagnostics
  console.log("[cm-bootstrap-cache-write]", result);
}

export function clearBootstrapCacheBusWriterStateForTests(): void {
  activeViewerUserId = null;
  processedEventIds.clear();
  cacheWriteCountForTests = 0;
}

export function getBootstrapCacheWriteCountForTests(): number {
  return cacheWriteCountForTests;
}

export function noteBootstrapCacheBusWriterViewerUserId(viewerUserId: string | null): void {
  const next = viewerUserId?.trim() || null;
  if (activeViewerUserId === next) return;
  activeViewerUserId = next;
  processedEventIds.clear();
  /**
   * DO NOT call clearBootstrapCache on viewer null.
   * DomainRoomStateRealtimeHost / BootstrapCacheSyncHost call this(null) on effect cleanup.
   * Host remount (Strict Mode, layout swap) was wiping the hub list session cache →
   * room→list return painted empty and memoryFresh skipped refetch.
   * Logout / explicit pull-refresh must clear the bootstrap cache themselves.
   */
}

function resolveBusPatch(
  ev: MessengerBusEvent,
  viewerUserId: string
): { patch: HomeListPatch; source: HomeListPatchSource; roomId: string } | null {
  switch (ev.type) {
    case "cm.room.message_sent": {
      if (!ev.senderUserId || ev.senderUserId.trim() !== viewerUserId) return null;
      return {
        patch: { kind: "sender_local_echo", roomId: ev.roomId, preview: ev.listPreview ?? null },
        source: "optimistic-read",
        roomId: ev.roomId,
      };
    }
    case "cm.room.call_stub_preview": {
      if (ev.viewerUserId.trim() !== viewerUserId) return null;
      return {
        patch: { kind: "call_stub_preview", roomId: ev.roomId, preview: ev.preview },
        source: "multi-tab",
        roomId: ev.roomId,
      };
    }
    case "cm.home.merge_room_summary": {
      if (ev.viewerUserId.trim() !== viewerUserId) return null;
      return {
        patch: { kind: "insert_room_summary", summary: ev.summary },
        source: "multi-tab",
        roomId: ev.summary.id,
      };
    }
    case "cm.room.summary_patch": {
      if (ev.viewerUserId.trim() !== viewerUserId) return null;
      const nextUnread =
        typeof ev.unreadCount === "number" && Number.isFinite(ev.unreadCount)
          ? Math.max(0, Math.floor(ev.unreadCount))
          : null;
      if (nextUnread == null) return null;
      return {
        patch: {
          kind: "room_update",
          roomId: ev.roomId,
          updater: (room) => applyHomeListSummaryPatchUnread(room, nextUnread),
        },
        source: "multi-tab",
        roomId: ev.roomId,
      };
    }
    default:
      return null;
  }
}

function previewFields(
  bootstrap: CommunityMessengerBootstrap | null,
  roomId: string
): { lastMessageAt: string | null; preview: string | null } {
  const row = findHomeListRoomRow(bootstrap, roomId);
  return {
    lastMessageAt: row?.lastMessageAt ?? null,
    preview: row?.lastMessage ?? null,
  };
}

/**
 * 단일 bootstrap cache writer — tip kinds go through Room Activity Projection (B).
 * merge/summary_patch keep direct applyHomeListPatch (non-tip ownership).
 */
export function applyBootstrapCacheBusEvent(
  ev: MessengerBusEvent,
  viewerUserId: string,
  writerId: string = BOOTSTRAP_CACHE_SYNC_HOST_WRITER_ID
): BootstrapCacheWriteResult {
  const me = viewerUserId.trim();
  const eventId = buildCommunityMessengerBusEventId(ev);
  const baseResult: BootstrapCacheWriteResult = {
    eventId,
    eventType: ev.type,
    roomId: null,
    writerId,
    previousLastMessageAt: null,
    nextLastMessageAt: null,
    previousPreview: null,
    nextPreview: null,
    cacheWriteApplied: false,
    cacheWriteSkipReason: null,
  };

  if (!me) {
    return { ...baseResult, cacheWriteSkipReason: "viewer_user_unresolved" };
  }
  if (activeViewerUserId && activeViewerUserId !== me) {
    return { ...baseResult, cacheWriteSkipReason: "viewer_user_mismatch" };
  }

  const resolved = resolveBusPatch(ev, me);
  if (!resolved) {
    return { ...baseResult, cacheWriteSkipReason: "event_not_owned_by_viewer" };
  }

  const { patch, source, roomId } = resolved;
  baseResult.roomId = roomId;

  if (processedEventIds.has(eventId)) {
    return { ...baseResult, cacheWriteSkipReason: "duplicate_event_id" };
  }

  const prevBootstrap = peekBootstrapCache();
  const before = previewFields(prevBootstrap, roomId);
  baseResult.previousLastMessageAt = before.lastMessageAt;
  baseResult.previousPreview = before.preview;

  /** Tip ownership: Room Activity Projection only (ACK / receive / call already wrote → no-op). */
  if (patch.kind === "sender_local_echo") {
    const preview = patch.preview;
    if (!preview?.lastMessageAt || !preview.lastMessage) {
      addBounded(processedEventIds, eventId, PROCESSED_EVENT_IDS_MAX);
      return { ...baseResult, cacheWriteSkipReason: "patch_noop" };
    }
    const tipEventId =
      (ev.type === "cm.room.message_sent" && (ev.messageId?.trim() || ev.clientMessageId?.trim())) ||
      `bus_sent:${roomId}:${preview.lastMessageAt}:${preview.lastMessage}`;
    if (
      wasRoomActivityEventProjected(tipEventId) ||
      (ev.type === "cm.room.message_sent" &&
        ev.messageId?.trim() &&
        wasRoomActivityEventProjected(ev.messageId.trim()))
    ) {
      addBounded(processedEventIds, eventId, PROCESSED_EVENT_IDS_MAX);
      return { ...baseResult, cacheWriteSkipReason: "projection_already_applied" };
    }
    const projected = projectRoomActivityToHomeList({
      roomId,
      eventId: tipEventId,
      eventKind: "text",
      previewText: preview.lastMessage,
      activityAt: preview.lastMessageAt,
      lastMessageType: preview.lastMessageType,
      boostUnread: false,
      source: "local_send_ack",
      viewerUserId: me,
    });
    addBounded(processedEventIds, eventId, PROCESSED_EVENT_IDS_MAX);
    if (!projected.accepted) {
      const skip =
        projected.reason === "call_stub_guard"
          ? "call_stub_preview_guard"
          : projected.reason === "stale_activity_at"
            ? "stale_last_message_at"
            : projected.reason;
      return { ...baseResult, cacheWriteSkipReason: skip };
    }
    const after = previewFields(projected.nextBootstrap, roomId);
    cacheWriteCountForTests += 1;
    const result: BootstrapCacheWriteResult = {
      ...baseResult,
      nextLastMessageAt: after.lastMessageAt,
      nextPreview: after.preview,
      cacheWriteApplied: true,
      cacheWriteSkipReason: null,
    };
    logBootstrapCacheWrite(result);
    return result;
  }

  if (patch.kind === "call_stub_preview") {
    const tipEventId = `bus_call:${roomId}:${patch.preview.lastMessageAt}:${patch.preview.lastMessage}`;
    if (wasRoomActivityEventProjected(tipEventId)) {
      addBounded(processedEventIds, eventId, PROCESSED_EVENT_IDS_MAX);
      return { ...baseResult, cacheWriteSkipReason: "projection_already_applied" };
    }
    const projected = projectRoomActivityToHomeList({
      roomId,
      eventId: tipEventId,
      eventKind: "call",
      previewText: patch.preview.lastMessage,
      activityAt: patch.preview.lastMessageAt,
      lastMessageType: "call_stub",
      boostUnread: false,
      source: "call_event",
      viewerUserId: me,
      revision: patch.preview.lastMessage,
    });
    addBounded(processedEventIds, eventId, PROCESSED_EVENT_IDS_MAX);
    if (!projected.accepted) {
      const skip =
        projected.reason === "call_stub_guard"
          ? "call_stub_preview_guard"
          : projected.reason === "stale_activity_at"
            ? "stale_last_message_at"
            : projected.reason;
      return { ...baseResult, cacheWriteSkipReason: skip };
    }
    const after = previewFields(projected.nextBootstrap, roomId);
    cacheWriteCountForTests += 1;
    const result: BootstrapCacheWriteResult = {
      ...baseResult,
      nextLastMessageAt: after.lastMessageAt,
      nextPreview: after.preview,
      cacheWriteApplied: true,
      cacheWriteSkipReason: null,
    };
    logBootstrapCacheWrite(result);
    return result;
  }

  if (patch.kind === "merge_room_summary") {
    const existing = findHomeListRoomRow(prevBootstrap, roomId);
    const incomingAt = trimText(patch.summary.lastMessageAt);
    const cachedAt = trimText(existing?.lastMessageAt);
    if (existing && incomingAt && cachedAt && lastEventAtMs(incomingAt) < lastEventAtMs(cachedAt)) {
      return { ...baseResult, cacheWriteSkipReason: "stale_merge_summary" };
    }
  }

  if (!prevBootstrap) {
    return { ...baseResult, cacheWriteSkipReason: "cache_empty" };
  }

  const next = applyHomeListPatch(prevBootstrap, patch, source);
  if (!next || next === prevBootstrap) {
    return { ...baseResult, cacheWriteSkipReason: "patch_noop" };
  }

  const after = previewFields(next, roomId);
  addBounded(processedEventIds, eventId, PROCESSED_EVENT_IDS_MAX);
  primeBootstrapCache(next);
  cacheWriteCountForTests += 1;

  const result: BootstrapCacheWriteResult = {
    ...baseResult,
    nextLastMessageAt: after.lastMessageAt,
    nextPreview: after.preview,
    cacheWriteApplied: true,
    cacheWriteSkipReason: null,
  };
  logBootstrapCacheWrite(result);
  return result;
}
