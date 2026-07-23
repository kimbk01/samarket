/**
 * Phase 7 — general_direct RealtimeApplyPort (isolated/test only).
 */
import { DOMAIN_BOOTSTRAP_SCHEMA_VERSION } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import {
  createDomainPersistentCachePort,
  type DomainPersistentCachePort,
} from "@/lib/messenger/contracts/persistent-cache-port";
import {
  createDomainRealtimeApplyPort,
  type DomainRealtimeApplyPort,
} from "@/lib/messenger/contracts/realtime-apply-port";
import { DomainEventEnvelopeError } from "@/lib/messenger/contracts/domain-event-envelope";
import { GENERAL_DIRECT_DOMAIN, type GeneralDirectListItem } from "@/lib/messenger/general-direct/types";

export type GeneralDirectMessagePayload = Readonly<{
  messageId: string;
  text: string;
  occurredAt: string;
  unreadCount?: number;
}>;

export type GeneralDirectUnreadPayload = Readonly<{
  unreadCount: number;
  messageId?: string;
}>;

function requireMessagePayload(payload: unknown): GeneralDirectMessagePayload {
  if (payload == null || typeof payload !== "object") {
    throw new DomainEventEnvelopeError("payload_invalid", "message");
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.messageId !== "string" || !p.messageId.trim()) {
    throw new DomainEventEnvelopeError("payload_invalid", "messageId");
  }
  if (typeof p.text !== "string") {
    throw new DomainEventEnvelopeError("payload_invalid", "text");
  }
  if (typeof p.occurredAt !== "string" || !p.occurredAt.trim()) {
    throw new DomainEventEnvelopeError("payload_invalid", "occurredAt");
  }
  return {
    messageId: p.messageId.trim(),
    text: p.text,
    occurredAt: p.occurredAt.trim(),
    unreadCount: typeof p.unreadCount === "number" ? p.unreadCount : undefined,
  };
}

export function createGeneralDirectRealtimeApplyPort(input: {
  viewerUserId: string;
  /** Authority path: inject Phase6 singleton. Default = isolated Map (harness only). */
  cache?: DomainPersistentCachePort<GeneralDirectListItem>;
}): DomainRealtimeApplyPort<GeneralDirectListItem> {
  // harness 전용 격리 cache — production Phase6 singleton 과 공유하지 않음 (default)
  const cache =
    input.cache ??
    createDomainPersistentCachePort<GeneralDirectListItem>(GENERAL_DIRECT_DOMAIN, "chat.general");
  const cacheKey = cache.buildCacheKey({ viewerUserId: input.viewerUserId });
  return createDomainRealtimeApplyPort({
    domain: GENERAL_DIRECT_DOMAIN,
    viewerUserId: input.viewerUserId,
    cache,
    cacheKey,
    validatePayload: (envelope) => {
      if (
        envelope.eventType === "message_created" ||
        envelope.eventType === "message_updated"
      ) {
        requireMessagePayload(envelope.payload);
      }
      if (envelope.eventType === "unread_changed") {
        const p = envelope.payload as { unreadCount?: unknown };
        if (typeof p?.unreadCount !== "number" || p.unreadCount < 0) {
          throw new DomainEventEnvelopeError("payload_invalid", "unreadCount");
        }
      }
    },
    buildPatch: ({ envelope, current }) => {
      if (envelope.eventType === "room_deleted" || envelope.eventType === "tombstone") {
        return {
          kind: "tombstone",
          tombstone: {
            domain: GENERAL_DIRECT_DOMAIN,
            identityKey: envelope.identityKey,
            roomId: envelope.roomId,
            generation: String(envelope.generation),
            reason: envelope.eventType,
          },
        };
      }
      if (envelope.eventType === "room_read") {
        return { kind: "read", roomId: envelope.roomId };
      }
      if (envelope.eventType === "unread_changed") {
        const unreadCount = (envelope.payload as GeneralDirectUnreadPayload).unreadCount;
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              unreadCount,
              generation: String(envelope.generation),
            },
          ],
        };
      }
      if (
        envelope.eventType === "message_created" ||
        envelope.eventType === "message_updated"
      ) {
        const msg = requireMessagePayload(envelope.payload);
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              lastMessage: msg.text,
              lastMessageAt: msg.occurredAt,
              unreadCount:
                msg.unreadCount !== undefined ? msg.unreadCount : existing.unreadCount,
              generation: String(envelope.generation),
              updatedAt: msg.occurredAt,
            },
          ],
        };
      }
      if (envelope.eventType === "participant_updated") {
        const p = envelope.payload as {
          peerDisplayName?: string;
          peerAvatarUrl?: string | null;
        };
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              peerDisplayName: p.peerDisplayName ?? existing.peerDisplayName,
              peerAvatarUrl:
                p.peerAvatarUrl !== undefined ? p.peerAvatarUrl : existing.peerAvatarUrl,
              generation: String(envelope.generation),
            },
          ],
        };
      }
      return { kind: "noop" };
    },
    recomputeHubBadge: ({ rows }) => ({
      hub: null,
      unreadRoomCount: rows.filter((r) => r.unreadCount > 0).length,
    }),
  });
}

export type GeneralDirectRealtimeApplyPort = ReturnType<typeof createGeneralDirectRealtimeApplyPort>;

export function emptyGeneralDirectHarnessSnapshot(
  viewerUserId: string,
  rows: ReadonlyArray<GeneralDirectListItem>
) {
  return {
    domain: GENERAL_DIRECT_DOMAIN,
    viewerUserId,
    generation: "0",
    schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
    producedAt: new Date().toISOString(),
    rows,
  };
}
