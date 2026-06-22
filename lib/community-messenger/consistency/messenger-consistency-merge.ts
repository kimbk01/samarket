/**
 * Versioned unread merge — local read guard + monotonic truth version (MRC1).
 */
import {
  logMessengerConsistencyAnalysis,
  type MessengerConsistencyAnalysis,
} from "@/lib/community-messenger/consistency/messenger-consistency-analysis";
import { evaluateMessengerConsistencyRegressionGuards } from "@/lib/community-messenger/consistency/messenger-consistency-regression-guard";
import {
  bumpRoomTruthVersion,
  getRoomTruthVersionMs,
  markDuplicateConsistencyEvent,
  type MessengerConsistencySurface,
  setSurfaceSnapshotVersionMs,
  shouldDiscardReconnectPayload,
  versionMsFromIso,
} from "@/lib/community-messenger/consistency/messenger-consistency-version";
import {
  resolveUnreadWithLocalReadGuard,
  setLocalReadGuard,
  shouldSuppressStaleUnread,
} from "@/lib/community-messenger/read/local-read-guard";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type MessengerUnreadMergeInput = {
  surface: MessengerConsistencySurface;
  roomId: string;
  incomingUnread: number;
  incomingLastMessageAt: string;
  incomingSnapshotUpdatedAt?: string | null;
  source: string;
  eventType: string;
  prevUnread?: number;
  userIdShort?: string;
  duplicateEventKey?: string;
  reconnectState?: string;
  crossTabState?: string;
};

/** snapshot fetch 가 realtime·read guard 보다 오래됐고 unread 를 올리려 할 때 — merge/alert 전에 prev 유지 */
export function isStaleUnreadSnapshotRow(
  prev: CommunityMessengerRoomSummary,
  incoming: CommunityMessengerRoomSummary,
  incomingSnapshotUpdatedAt?: string | null
): boolean {
  if (incoming.unreadCount <= prev.unreadCount) return false;

  const lastMessageAt = String(incoming.lastMessageAt ?? "");
  if (
    shouldSuppressStaleUnread({
      roomId: incoming.id,
      incomingUnread: incoming.unreadCount,
      incomingLastMessageAt: lastMessageAt,
    })
  ) {
    return true;
  }

  const incomingVersionMs = versionMsFromIso(lastMessageAt, incomingSnapshotUpdatedAt ?? undefined);
  const truthMs = getRoomTruthVersionMs(incoming.id);
  return incomingVersionMs > 0 && truthMs > 0 && incomingVersionMs < truthMs;
}

/** bootstrap / home-sync list row — stale unread snapshot 은 prev 그대로 (regression alert 유발 없음) */
export function coalesceRoomSummarySnapshotRow(
  prev: CommunityMessengerRoomSummary | undefined,
  incoming: CommunityMessengerRoomSummary,
  args: Omit<MessengerUnreadMergeInput, "incomingUnread" | "incomingLastMessageAt" | "prevUnread">
): CommunityMessengerRoomSummary {
  if (!prev) return incoming;
  if (isStaleUnreadSnapshotRow(prev, incoming, args.incomingSnapshotUpdatedAt)) {
    return prev;
  }
  if (prev.unreadCount === incoming.unreadCount && prev.lastMessageAt === incoming.lastMessageAt) {
    return incoming;
  }
  return mergeRoomSummaryWithConsistency(prev, incoming, args);
}

export type MessengerUnreadMergeResult = {
  unreadCount: number;
  suppressed: boolean;
  allowedNewMessage: boolean;
  resolution_path: string;
  stale_detected: boolean;
  flicker_detected: boolean;
  duplicate_event_detected: boolean;
};

export function resolveMessengerUnreadMerge(input: MessengerUnreadMergeInput): MessengerUnreadMergeResult {
  const prevUnread = Math.max(0, Math.floor(Number(input.prevUnread) || 0));
  const incomingVersionMs = versionMsFromIso(
    input.incomingLastMessageAt,
    input.incomingSnapshotUpdatedAt ?? undefined
  );
  const truthMs = getRoomTruthVersionMs(input.roomId);

  if (input.incomingSnapshotUpdatedAt) {
    setSurfaceSnapshotVersionMs(input.surface, versionMsFromIso(input.incomingSnapshotUpdatedAt));
  }

  let duplicate_event_detected = false;
  if (input.duplicateEventKey) {
    duplicate_event_detected = markDuplicateConsistencyEvent(input.duplicateEventKey);
    if (duplicate_event_detected) {
      const analysis = buildAnalysis(input, {
        unreadCount: prevUnread,
        resolution_path: "duplicate_event_discard",
        stale_detected: false,
        flicker_detected: false,
        duplicate_event_detected: true,
        incomingVersionMs,
        truthMs,
      });
      logMessengerConsistencyAnalysis(analysis);
      evaluateMessengerConsistencyRegressionGuards(analysis);
      return {
        unreadCount: prevUnread,
        suppressed: true,
        allowedNewMessage: false,
        resolution_path: "duplicate_event_discard",
        stale_detected: false,
        flicker_detected: false,
        duplicate_event_detected: true,
      };
    }
  }

  if (shouldDiscardReconnectPayload(incomingVersionMs)) {
    const analysis = buildAnalysis(input, {
      unreadCount: prevUnread,
      resolution_path: "reconnect_stale_discard",
      stale_detected: false,
      flicker_detected: false,
      duplicate_event_detected: false,
      incomingVersionMs,
      truthMs,
    });
    logMessengerConsistencyAnalysis(analysis);
    evaluateMessengerConsistencyRegressionGuards(analysis);
    return {
      unreadCount: prevUnread,
      suppressed: true,
      allowedNewMessage: false,
      resolution_path: "reconnect_stale_discard",
      stale_detected: false,
      flicker_detected: false,
      duplicate_event_detected: false,
    };
  }

  const guard = resolveUnreadWithLocalReadGuard({
    roomId: input.roomId,
    incomingUnread: input.incomingUnread,
    incomingLastMessageAt: input.incomingLastMessageAt,
  });

  let unreadCount = guard.unreadCount;
  let resolution_path = guard.suppressed
    ? "local_read_guard"
    : guard.allowedNewMessage
      ? "new_message_accepted"
      : "server_accepted";
  const stale_detected = false;
  let flicker_detected = false;
  let blockedStaleUnread = false;

  if (
    incomingVersionMs > 0 &&
    truthMs > 0 &&
    incomingVersionMs < truthMs &&
    unreadCount > prevUnread
  ) {
    unreadCount = prevUnread;
    blockedStaleUnread = true;
    resolution_path = "stale_version_discard";
  }

  if (prevUnread === 0 && unreadCount > 0 && guard.suppressed) {
    flicker_detected = true;
  }

  if (unreadCount === 0 && prevUnread > 0) {
    setLocalReadGuard({
      roomId: input.roomId,
      referenceLastMessageAt: input.incomingLastMessageAt,
      source: "bus_sync",
    });
  }

  if (!blockedStaleUnread && !guard.suppressed) {
    bumpRoomTruthVersion(
      input.roomId,
      Math.max(incomingVersionMs, versionMsFromIso(input.incomingLastMessageAt)),
      input.source
    );
  }

  const analysis = buildAnalysis(input, {
    unreadCount,
    resolution_path,
    stale_detected,
    flicker_detected,
    duplicate_event_detected,
    incomingVersionMs,
    truthMs,
    optimistic_state: guard.suppressed ? "read_guard_active" : undefined,
    server_state: String(input.incomingUnread),
  });
  logMessengerConsistencyAnalysis(analysis);
  evaluateMessengerConsistencyRegressionGuards(analysis);

  return {
    unreadCount,
    suppressed: guard.suppressed || blockedStaleUnread,
    allowedNewMessage: guard.allowedNewMessage,
    resolution_path,
    stale_detected,
    flicker_detected,
    duplicate_event_detected,
  };
}

function buildAnalysis(
  input: MessengerUnreadMergeInput,
  out: {
    unreadCount: number;
    resolution_path: string;
    stale_detected: boolean;
    flicker_detected: boolean;
    duplicate_event_detected: boolean;
    incomingVersionMs: number;
    truthMs: number;
    optimistic_state?: string;
    server_state?: string;
  }
): MessengerConsistencyAnalysis {
  const prevUnread = Math.max(0, Math.floor(Number(input.prevUnread) || 0));
  return {
    surface: input.surface,
    room_id: input.roomId,
    user_id_short: input.userIdShort,
    event_type: input.eventType,
    source: input.source,
    snapshot_version: versionMsFromIso(input.incomingSnapshotUpdatedAt ?? undefined) || undefined,
    realtime_version: out.incomingVersionMs || undefined,
    local_store_version: out.truthMs || undefined,
    unread_before: prevUnread,
    unread_after: out.unreadCount,
    optimistic_state: out.optimistic_state,
    server_state: out.server_state,
    cross_tab_state: input.crossTabState,
    reconnect_state: input.reconnectState,
    stale_detected: out.stale_detected ? 1 : 0,
    flicker_detected: out.flicker_detected ? 1 : 0,
    duplicate_event_detected: out.duplicate_event_detected ? 1 : 0,
    desync_ms:
      out.incomingVersionMs > 0 && out.truthMs > 0
        ? Math.abs(out.incomingVersionMs - out.truthMs)
        : undefined,
    resolution_path: out.resolution_path,
  };
}

/** Room summary merge with versioned unread — preserves non-unread fields from incoming. */
export function mergeRoomSummaryWithConsistency(
  prev: CommunityMessengerRoomSummary | undefined,
  incoming: CommunityMessengerRoomSummary,
  args: Omit<MessengerUnreadMergeInput, "incomingUnread" | "incomingLastMessageAt" | "prevUnread">
): CommunityMessengerRoomSummary {
  const incomingLastMessageAt = String(incoming.lastMessageAt ?? "");
  const merged = resolveMessengerUnreadMerge({
    ...args,
    incomingUnread: incoming.unreadCount,
    incomingLastMessageAt,
    prevUnread: prev?.unreadCount,
  });
  let row: CommunityMessengerRoomSummary = { ...incoming, unreadCount: merged.unreadCount };
  if (prev && merged.resolution_path === "stale_version_discard") {
    const incomingVersionMs = versionMsFromIso(
      incomingLastMessageAt,
      args.incomingSnapshotUpdatedAt ?? undefined
    );
    const truthMs = getRoomTruthVersionMs(args.roomId);
    if (incomingVersionMs > 0 && truthMs > 0 && incomingVersionMs < truthMs) {
      row = {
        ...row,
        lastMessageAt: prev.lastMessageAt,
        lastMessage: prev.lastMessage,
        lastMessageType: prev.lastMessageType,
      };
    }
  }
  return row;
}
