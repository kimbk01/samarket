/**
 * Room Activity → Home list tip projection (B body).
 *
 * CONTRACT:
 * - Sole tip writer into hub bootstrap cache for send/receive/call/reconcile.
 * - Always goes through `applyHomeListPatch` + `primeBootstrapCache`.
 * - Same eventId converges to 1 accepted + N no-op (ACK + Realtime echo + bus + exit).
 * - DO NOT introduce a new global ConversationStore.
 * - DO NOT full-refresh / silent hydrated refresh from here.
 */

import { isChatDomain, type ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  applyDomainStoreOrderListRealtimeMessagePatch,
  applyDomainTradeListRealtimeMessagePatch,
} from "@/components/community-messenger/domain-shell-canary/domain-list-canary-realtime-patch";
import { peekBootstrapCache, primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import {
  applyHomeListPatch,
  findHomeListRoomRow,
  type HomeListPatch,
  type HomeListPatchSource,
} from "@/lib/community-messenger/home-list-patch";
import {
  listPreviewFromMessengerMessageRow,
  shouldApplyCallStubListPreviewPatch,
} from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import { normalizeMessengerRealtimeRoomId } from "@/lib/community-messenger/stores/messenger-realtime-store";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerMessage,
  CommunityMessengerMessageType,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

export type RoomActivityProjectionSource =
  | "local_send_ack"
  | "remote_message_realtime"
  | "call_event"
  | "surface_reconcile";

export type RoomActivityEventKind =
  | "text"
  | "image"
  | "file"
  | "voice"
  | "sticker"
  | "call"
  | "system"
  | "community_post_share";

export type RoomActivityProjection = {
  roomId: string;
  chatDomain?: ChatDomain | null;
  domainIdentityKey?: string | null;
  eventId: string;
  eventKind: RoomActivityEventKind;
  previewText: string;
  activityAt: string;
  revision?: string | number;
  /** When set, forces unread (remote). Omit for send/ack/call terminal. */
  boostUnread?: boolean;
  unreadCount?: number;
  lastMessageType?: CommunityMessengerMessageType;
  source: RoomActivityProjectionSource;
  viewerUserId?: string | null;
};

export type RoomActivityProjectionResult = {
  accepted: boolean;
  reason:
    | "accepted"
    | "missing_room_id"
    | "missing_event_id"
    | "missing_preview"
    | "cache_empty"
    | "room_missing"
    | "duplicate_event"
    | "stale_activity_at"
    | "same_payload"
    | "call_stub_guard"
    | "patch_noop";
  source: RoomActivityProjectionSource;
  roomId: string | null;
  eventId: string | null;
  changedRoomCount: number;
  listOrderChanged: boolean;
  nextBootstrap: CommunityMessengerBootstrap | null;
  previousEventId: string | null;
  previousActivityAt: string | null;
  incomingActivityAt: string | null;
};

type AppliedTip = {
  eventId: string;
  activityAt: string;
  previewText: string;
  revision: string;
  source: RoomActivityProjectionSource;
};

const appliedByEventId = new Map<string, AppliedTip>();
const tipByRoomId = new Map<string, AppliedTip>();
const listeners = new Set<(result: RoomActivityProjectionResult) => void>();

let acceptedCountForTests = 0;
let droppedCountForTests = 0;
let lastResultForTests: RoomActivityProjectionResult | null = null;

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function activityMs(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function revisionKey(revision: string | number | undefined): string {
  if (revision === undefined || revision === null) return "";
  return String(revision);
}

function eventKindFromMessageType(mt: string): RoomActivityEventKind {
  if (mt === "image") return "image";
  if (mt === "file") return "file";
  if (mt === "voice") return "voice";
  if (mt === "sticker") return "sticker";
  if (mt === "call_stub") return "call";
  if (mt === "system") return "system";
  if (mt === "community_post_share") return "community_post_share";
  return "text";
}

function patchSourceFor(source: RoomActivityProjectionSource): HomeListPatchSource {
  switch (source) {
    case "local_send_ack":
      return "optimistic-read";
    case "remote_message_realtime":
      return "realtime";
    case "call_event":
      return "multi-tab";
    case "surface_reconcile":
      return "multi-tab";
    default:
      return "realtime";
  }
}

function logProjection(result: RoomActivityProjectionResult): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console -- room activity projection diagnostics
  console.log("[cm-room-activity-projection]", {
    accepted: result.accepted,
    reason: result.reason,
    source: result.source,
    roomId: result.roomId,
    eventId: result.eventId,
    changedRoomCount: result.changedRoomCount,
    listOrderChanged: result.listOrderChanged,
    previousEventId: result.previousEventId,
    previousActivityAt: result.previousActivityAt,
    incomingActivityAt: result.incomingActivityAt,
  });
}

function finish(result: RoomActivityProjectionResult): RoomActivityProjectionResult {
  lastResultForTests = result;
  if (result.accepted) acceptedCountForTests += 1;
  else droppedCountForTests += 1;
  logProjection(result);
  for (const l of listeners) {
    try {
      l(result);
    } catch {
      /* ignore subscriber errors */
    }
  }
  return result;
}

function resolveIdentity(
  roomId: string,
  cache: CommunityMessengerBootstrap,
  activity: RoomActivityProjection
): { chatDomain: ChatDomain | null; domainIdentityKey: string | null; row: CommunityMessengerRoomSummary | null } {
  const row = findHomeListRoomRow(cache, roomId);
  const chatDomain =
    (isChatDomain(activity.chatDomain) ? activity.chatDomain : null) ??
    (row && isChatDomain(row.chatDomain) ? row.chatDomain : null);
  const domainIdentityKey =
    trim(activity.domainIdentityKey) ||
    trim(row?.domainIdentityKey) ||
    null;
  return { chatDomain, domainIdentityKey, row };
}

function buildPatch(activity: RoomActivityProjection): HomeListPatch | null {
  const roomId = trim(activity.roomId);
  const previewText = trim(activity.previewText);
  const activityAt = trim(activity.activityAt);
  if (!roomId || !previewText || !activityAt) return null;

  const lastMessageType =
    activity.lastMessageType ??
    (activity.eventKind === "call"
      ? "call_stub"
      : activity.eventKind === "image"
        ? "image"
        : activity.eventKind === "file"
          ? "file"
          : activity.eventKind === "voice"
            ? "voice"
            : activity.eventKind === "sticker"
              ? "sticker"
              : activity.eventKind === "system"
                ? "system"
                : activity.eventKind === "community_post_share"
                  ? "community_post_share"
                  : "text");

  if (activity.source === "call_event" || activity.eventKind === "call") {
    return {
      kind: "call_stub_preview",
      roomId,
      preview: {
        lastMessage: previewText,
        lastMessageType: "call_stub",
        lastMessageAt: activityAt,
      },
    };
  }

  if (activity.source === "local_send_ack" || activity.boostUnread !== true) {
    return {
      kind: "sender_local_echo",
      roomId,
      preview: {
        lastMessage: previewText,
        lastMessageType,
        lastMessageAt: activityAt,
      },
    };
  }

  return {
    kind: "realtime_message_insert",
    roomId,
    messageRow: {
      id: activity.eventId,
      content: previewText,
      message_type: lastMessageType,
      created_at: activityAt,
    },
    boostUnreadCount: true,
  };
}

function routeDomainCanary(
  activity: RoomActivityProjection,
  chatDomain: ChatDomain | null,
  accepted: boolean
): void {
  if (!accepted) return;
  const viewer = trim(activity.viewerUserId);
  if (!viewer || !chatDomain) return;
  if (chatDomain === "trade") {
    applyDomainTradeListRealtimeMessagePatch({
      viewerUserId: viewer,
      roomId: trim(activity.roomId),
      previewText: trim(activity.previewText),
      lastMessageAt: trim(activity.activityAt),
      boostUnread: activity.boostUnread === true,
    });
  } else if (chatDomain === "store_order") {
    applyDomainStoreOrderListRealtimeMessagePatch({
      viewerUserId: viewer,
      roomId: trim(activity.roomId),
      previewText: trim(activity.previewText),
      lastMessageAt: trim(activity.activityAt),
      boostUnread: activity.boostUnread === true,
    });
  }
}

/**
 * Product body: project one canonical room activity onto hub list (+ domain canary when applicable).
 */
export function projectRoomActivityToHomeList(
  activity: RoomActivityProjection
): RoomActivityProjectionResult {
  const roomId = trim(activity.roomId);
  const eventId = trim(activity.eventId);
  const previewText = trim(activity.previewText);
  const activityAt = trim(activity.activityAt);
  const baseEmpty: Omit<RoomActivityProjectionResult, "accepted" | "reason" | "changedRoomCount" | "listOrderChanged" | "nextBootstrap"> = {
    source: activity.source,
    roomId: roomId || null,
    eventId: eventId || null,
    previousEventId: null,
    previousActivityAt: null,
    incomingActivityAt: activityAt || null,
  };

  if (!roomId) {
    return finish({
      ...baseEmpty,
      accepted: false,
      reason: "missing_room_id",
      changedRoomCount: 0,
      listOrderChanged: false,
      nextBootstrap: null,
    });
  }
  if (!eventId) {
    return finish({
      ...baseEmpty,
      accepted: false,
      reason: "missing_event_id",
      changedRoomCount: 0,
      listOrderChanged: false,
      nextBootstrap: null,
    });
  }
  if (!previewText || !activityAt) {
    return finish({
      ...baseEmpty,
      accepted: false,
      reason: "missing_preview",
      changedRoomCount: 0,
      listOrderChanged: false,
      nextBootstrap: null,
    });
  }

  const roomKey = normalizeMessengerRealtimeRoomId(roomId);
  const prevTip = tipByRoomId.get(roomKey) ?? appliedByEventId.get(eventId) ?? null;
  baseEmpty.previousEventId = prevTip?.eventId ?? null;
  baseEmpty.previousActivityAt = prevTip?.activityAt ?? null;

  const dup = appliedByEventId.get(eventId);
  if (
    dup &&
    dup.previewText === previewText &&
    dup.activityAt === activityAt &&
    revisionKey(dup.revision) === revisionKey(activity.revision)
  ) {
    return finish({
      ...baseEmpty,
      accepted: false,
      reason: "duplicate_event",
      changedRoomCount: 0,
      listOrderChanged: false,
      nextBootstrap: peekBootstrapCache(),
    });
  }

  const cache = peekBootstrapCache();
  if (!cache) {
    return finish({
      ...baseEmpty,
      accepted: false,
      reason: "cache_empty",
      changedRoomCount: 0,
      listOrderChanged: false,
      nextBootstrap: null,
    });
  }

  const { chatDomain, row } = resolveIdentity(roomId, cache, activity);
  if (!row) {
    return finish({
      ...baseEmpty,
      accepted: false,
      reason: "room_missing",
      changedRoomCount: 0,
      listOrderChanged: false,
      nextBootstrap: cache,
    });
  }

  const incomingMs = activityMs(activityAt);
  const cachedMs = activityMs(String(row.lastMessageAt ?? ""));
  const samePreview =
    String(row.lastMessage ?? "") === previewText &&
    String(row.lastMessageAt ?? "") === activityAt &&
    (activity.lastMessageType == null ||
      String(row.lastMessageType ?? "") === String(activity.lastMessageType));

  if (samePreview && activity.source !== "call_event") {
    const tip: AppliedTip = {
      eventId,
      activityAt,
      previewText,
      revision: revisionKey(activity.revision),
      source: activity.source,
    };
    appliedByEventId.set(eventId, tip);
    tipByRoomId.set(roomKey, tip);
    return finish({
      ...baseEmpty,
      accepted: false,
      reason: "same_payload",
      changedRoomCount: 0,
      listOrderChanged: false,
      nextBootstrap: cache,
    });
  }

  // Forward-only for message tips (call may keep same activityAt and only change preview).
  if (
    activity.eventKind !== "call" &&
    activity.source !== "call_event" &&
    incomingMs > 0 &&
    cachedMs > incomingMs
  ) {
    return finish({
      ...baseEmpty,
      accepted: false,
      reason: "stale_activity_at",
      changedRoomCount: 0,
      listOrderChanged: false,
      nextBootstrap: cache,
    });
  }

  const patch = buildPatch(activity);
  if (!patch) {
    return finish({
      ...baseEmpty,
      accepted: false,
      reason: "missing_preview",
      changedRoomCount: 0,
      listOrderChanged: false,
      nextBootstrap: cache,
    });
  }

  if (patch.kind === "call_stub_preview") {
    if (!shouldApplyCallStubListPreviewPatch(row, patch.preview)) {
      const tip: AppliedTip = {
        eventId,
        activityAt,
        previewText,
        revision: revisionKey(activity.revision),
        source: activity.source,
      };
      appliedByEventId.set(eventId, tip);
      tipByRoomId.set(roomKey, tip);
      return finish({
        ...baseEmpty,
        accepted: false,
        reason: "call_stub_guard",
        changedRoomCount: 0,
        listOrderChanged: false,
        nextBootstrap: cache,
      });
    }
  }

  const beforeAt = String(row.lastMessageAt ?? "");
  const next = applyHomeListPatch(cache, patch, patchSourceFor(activity.source));
  if (!next || next === cache) {
    return finish({
      ...baseEmpty,
      accepted: false,
      reason: "patch_noop",
      changedRoomCount: 0,
      listOrderChanged: false,
      nextBootstrap: cache,
    });
  }

  primeBootstrapCache(next);
  const afterRow = findHomeListRoomRow(next, roomId);
  const afterAt = String(afterRow?.lastMessageAt ?? "");
  const listOrderChanged = beforeAt !== afterAt;

  const tip: AppliedTip = {
    eventId,
    activityAt,
    previewText,
    revision: revisionKey(activity.revision),
    source: activity.source,
  };
  appliedByEventId.set(eventId, tip);
  tipByRoomId.set(roomKey, tip);
  if (appliedByEventId.size > 800) {
    const first = appliedByEventId.keys().next();
    if (!first.done) appliedByEventId.delete(first.value);
  }

  routeDomainCanary(activity, chatDomain, true);

  return finish({
    ...baseEmpty,
    accepted: true,
    reason: "accepted",
    changedRoomCount: 1,
    listOrderChanged,
    nextBootstrap: next,
  });
}

/** True when this eventId already produced an accepted or same-payload tip write. */
export function wasRoomActivityEventProjected(eventId: string): boolean {
  const id = trim(eventId);
  return Boolean(id && appliedByEventId.has(id));
}

export function getRoomActivityTipForRoom(roomId: string): AppliedTip | null {
  const key = normalizeMessengerRealtimeRoomId(roomId);
  return key ? tipByRoomId.get(key) ?? null : null;
}

export function subscribeRoomActivityProjection(
  listener: (result: RoomActivityProjectionResult) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearRoomActivityProjectionStateForTests(): void {
  appliedByEventId.clear();
  tipByRoomId.clear();
  acceptedCountForTests = 0;
  droppedCountForTests = 0;
  lastResultForTests = null;
}

export function getRoomActivityProjectionStatsForTests(): {
  accepted: number;
  dropped: number;
  last: RoomActivityProjectionResult | null;
} {
  return {
    accepted: acceptedCountForTests,
    dropped: droppedCountForTests,
    last: lastResultForTests,
  };
}

export function roomActivityFromMessengerMessage(args: {
  message: CommunityMessengerMessage;
  source: RoomActivityProjectionSource;
  boostUnread?: boolean;
  viewerUserId?: string | null;
  chatDomain?: ChatDomain | null;
  domainIdentityKey?: string | null;
  revision?: string | number;
}): RoomActivityProjection | null {
  const row = {
    id: args.message.id,
    room_id: args.message.roomId,
    sender_id: args.message.senderId,
    message_type: args.message.messageType,
    content: args.message.content,
    metadata: args.message.metadata ?? null,
    created_at: args.message.createdAt,
  };
  const preview = listPreviewFromMessengerMessageRow(row);
  if (!preview) return null;
  const eventId = trim(args.message.id);
  if (!eventId) return null;
  return {
    roomId: trim(args.message.roomId),
    chatDomain: args.chatDomain,
    domainIdentityKey: args.domainIdentityKey,
    eventId,
    eventKind: eventKindFromMessageType(String(args.message.messageType ?? "text")),
    previewText: preview.lastMessage,
    activityAt: preview.lastMessageAt,
    revision: args.revision,
    boostUnread: args.boostUnread,
    lastMessageType: preview.lastMessageType,
    source: args.source,
    viewerUserId: args.viewerUserId,
  };
}

export function roomActivityFromMessageRow(args: {
  roomId: string;
  messageRow: Record<string, unknown>;
  source: RoomActivityProjectionSource;
  boostUnread?: boolean;
  viewerUserId?: string | null;
  chatDomain?: ChatDomain | null;
  domainIdentityKey?: string | null;
  revision?: string | number;
}): RoomActivityProjection | null {
  const preview = listPreviewFromMessengerMessageRow(args.messageRow);
  if (!preview) return null;
  const eventId =
    trim(args.messageRow.id) ||
    trim(args.messageRow.message_id) ||
    "";
  if (!eventId) return null;
  const mt = trim(args.messageRow.message_type) || "text";
  return {
    roomId: trim(args.roomId),
    chatDomain: args.chatDomain,
    domainIdentityKey: args.domainIdentityKey,
    eventId,
    eventKind: eventKindFromMessageType(mt),
    previewText: preview.lastMessage,
    activityAt: preview.lastMessageAt,
    revision: args.revision,
    boostUnread: args.boostUnread,
    lastMessageType: preview.lastMessageType,
    source: args.source,
    viewerUserId: args.viewerUserId,
  };
}
