import type {
  ConversationEvent,
  ConversationPreview,
  ConversationSummary,
  ConversationUpsertEvent,
} from "@/lib/community-messenger/conversation-engine/types";
import { normalizeConversationRoomId } from "@/lib/community-messenger/conversation-engine/identity";

export type ApplyConversationEventResult = Readonly<{
  next: readonly ConversationSummary[];
  applied: boolean;
  reason?: string;
  /** Same array reference when no structural change. */
  sameArrayRef: boolean;
}>;

function activityMs(iso: string): number {
  const ms = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isTerminalCallStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return (
    s === "ended" ||
    s === "cancelled" ||
    s === "rejected" ||
    s === "missed" ||
    s === "busy" ||
    s === "failed" ||
    s === "peer_busy"
  );
}

function isInFlightCallStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "dialing" || s === "ringing";
}

function previewEqual(a: ConversationPreview, b: ConversationPreview): boolean {
  return (
    a.kind === b.kind &&
    a.text === b.text &&
    String(a.messageId ?? "") === String(b.messageId ?? "") &&
    String(a.callStatus ?? "") === String(b.callStatus ?? "") &&
    String(a.callId ?? "") === String(b.callId ?? "") &&
    String(a.sessionId ?? "") === String(b.sessionId ?? "")
  );
}

function findIndex(rows: readonly ConversationSummary[], conversationId: string): number {
  const id = normalizeConversationRoomId(conversationId);
  return rows.findIndex((r) => normalizeConversationRoomId(r.conversationId) === id);
}

function upsertFromEvent(existing: ConversationSummary | null, event: ConversationUpsertEvent): ConversationSummary {
  const base: ConversationSummary = existing ?? {
    conversationId: event.conversationId,
    roomId: event.roomId,
    domain: event.domain,
    domainIdentityKey: event.domainIdentityKey ?? null,
    title: event.title ?? "",
    subtitle: event.subtitle ?? "",
    avatarUrl: event.avatarUrl ?? null,
    unreadCount: event.unreadCount ?? 0,
    isMuted: event.isMuted ?? false,
    isPinned: event.isPinned ?? false,
    isArchivedByViewer: event.isArchivedByViewer ?? false,
    isBlockedHiddenByViewer: event.isBlockedHiddenByViewer ?? false,
    lastActivityAt: event.lastActivityAt,
    preview: event.preview,
    revision: event.revision,
    roomType: event.roomType ?? "direct",
    roomStatus: event.roomStatus ?? "active",
    peerUserId: event.peerUserId ?? null,
    messengerDirectKey: event.messengerDirectKey ?? null,
  };

  return {
    ...base,
    domain: event.domain,
    domainIdentityKey:
      event.domainIdentityKey !== undefined ? event.domainIdentityKey : base.domainIdentityKey,
    title: event.title !== undefined ? event.title : base.title,
    subtitle: event.subtitle !== undefined ? event.subtitle : base.subtitle,
    avatarUrl: event.avatarUrl !== undefined ? event.avatarUrl : base.avatarUrl,
    unreadCount: event.unreadCount !== undefined ? event.unreadCount : base.unreadCount,
    isMuted: event.isMuted !== undefined ? event.isMuted : base.isMuted,
    isPinned: event.isPinned !== undefined ? event.isPinned : base.isPinned,
    isArchivedByViewer:
      event.isArchivedByViewer !== undefined ? event.isArchivedByViewer : base.isArchivedByViewer,
    isBlockedHiddenByViewer:
      event.isBlockedHiddenByViewer !== undefined
        ? event.isBlockedHiddenByViewer
        : base.isBlockedHiddenByViewer,
    lastActivityAt: event.lastActivityAt,
    preview: event.preview,
    revision: event.revision,
    roomType: event.roomType !== undefined ? event.roomType : base.roomType,
    roomStatus: event.roomStatus !== undefined ? event.roomStatus : base.roomStatus,
    peerUserId: event.peerUserId !== undefined ? event.peerUserId : base.peerUserId,
    messengerDirectKey:
      event.messengerDirectKey !== undefined ? event.messengerDirectKey : base.messengerDirectKey,
    roomId: event.roomId || base.roomId,
    conversationId: event.conversationId || base.conversationId,
  };
}

/**
 * Sole conversation-list writer. Idempotent by eventId (caller tracks seen ids).
 * Forward-only activityAt/revision; terminal call cannot be overwritten by dialing.
 */
export function applyConversationEvent(
  rows: readonly ConversationSummary[],
  event: ConversationEvent,
  opts?: { seenEventIds?: ReadonlySet<string>; log?: (msg: string, extra?: Record<string, unknown>) => void }
): ApplyConversationEventResult {
  const seen = opts?.seenEventIds;
  if (seen?.has(event.eventId)) {
    return { next: rows, applied: false, reason: "duplicate_event_id", sameArrayRef: true };
  }

  if (event.type === "conversation_remove") {
    const idx = findIndex(rows, event.conversationId);
    if (idx < 0) {
      return { next: rows, applied: false, reason: "missing", sameArrayRef: true };
    }
    const existing = rows[idx]!;
    if (existing.domain !== event.domain) {
      opts?.log?.("conversation_engine_domain_mismatch", {
        eventId: event.eventId,
        expected: existing.domain,
        got: event.domain,
      });
      return { next: rows, applied: false, reason: "domain_mismatch", sameArrayRef: true };
    }
    const next = [...rows.slice(0, idx), ...rows.slice(idx + 1)];
    return { next, applied: true, sameArrayRef: false };
  }

  if (event.type === "conversation_read") {
    const idx = findIndex(rows, event.conversationId);
    if (idx < 0) {
      return { next: rows, applied: false, reason: "missing", sameArrayRef: true };
    }
    const existing = rows[idx]!;
    if (existing.domain !== event.domain) {
      opts?.log?.("conversation_engine_domain_mismatch", {
        eventId: event.eventId,
        expected: existing.domain,
        got: event.domain,
      });
      return { next: rows, applied: false, reason: "domain_mismatch", sameArrayRef: true };
    }
    if (event.revision != null && event.revision > 0 && event.revision < existing.revision) {
      return { next: rows, applied: false, reason: "stale_revision", sameArrayRef: true };
    }
    if (existing.unreadCount === event.unreadCount) {
      return { next: rows, applied: false, reason: "equal_payload", sameArrayRef: true };
    }
    const updated: ConversationSummary = {
      ...existing,
      unreadCount: event.unreadCount,
      revision: event.revision != null && event.revision > existing.revision ? event.revision : existing.revision,
    };
    const next = [...rows];
    next[idx] = updated;
    return { next, applied: true, sameArrayRef: false };
  }

  // conversation_upsert
  const idx = findIndex(rows, event.conversationId);
  const existing = idx >= 0 ? rows[idx]! : null;

  if (existing && existing.domain !== event.domain) {
    opts?.log?.("conversation_engine_domain_mismatch", {
      eventId: event.eventId,
      expected: existing.domain,
      got: event.domain,
    });
    return { next: rows, applied: false, reason: "domain_mismatch", sameArrayRef: true };
  }

  if (existing) {
    if (event.revision > 0 && existing.revision > 0 && event.revision < existing.revision) {
      return { next: rows, applied: false, reason: "stale_revision", sameArrayRef: true };
    }
    const existingMs = activityMs(existing.lastActivityAt);
    const eventMs = activityMs(event.lastActivityAt);
    if (eventMs > 0 && existingMs > 0 && eventMs < existingMs) {
      return { next: rows, applied: false, reason: "stale_activity", sameArrayRef: true };
    }

    if (
      existing.preview.kind === "call" &&
      isTerminalCallStatus(existing.preview.callStatus) &&
      event.preview.kind === "call" &&
      isInFlightCallStatus(event.preview.callStatus)
    ) {
      return { next: rows, applied: false, reason: "call_terminal_guard", sameArrayRef: true };
    }

    const candidate = upsertFromEvent(existing, event);
    const unchanged =
      candidate.lastActivityAt === existing.lastActivityAt &&
      candidate.revision === existing.revision &&
      candidate.unreadCount === existing.unreadCount &&
      candidate.isPinned === existing.isPinned &&
      candidate.isMuted === existing.isMuted &&
      candidate.title === existing.title &&
      previewEqual(candidate.preview, existing.preview);
    if (unchanged) {
      return { next: rows, applied: false, reason: "equal_payload", sameArrayRef: true };
    }

    const next = [...rows];
    next[idx] = candidate;
    return { next, applied: true, sameArrayRef: false };
  }

  const created = upsertFromEvent(null, event);
  return { next: [...rows, created], applied: true, sameArrayRef: false };
}
