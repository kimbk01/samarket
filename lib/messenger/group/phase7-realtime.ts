/**
 * Phase 7 — group RealtimeApplyPort (isolated/test only).
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
import { GROUP_DOMAIN, type GroupListItem } from "@/lib/messenger/group/types";

function requireMessagePayload(payload: unknown): {
  messageId: string;
  text: string;
  occurredAt: string;
  unreadCount?: number;
} {
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

export function createGroupRealtimeApplyPort(input: {
  viewerUserId: string;
  /** Authority path: inject Phase6 singleton. Default = isolated Map (harness only). */
  cache?: DomainPersistentCachePort<GroupListItem>;
}): DomainRealtimeApplyPort<GroupListItem> {
  const cache =
    input.cache ?? createDomainPersistentCachePort<GroupListItem>(GROUP_DOMAIN, "chat.group");
  const cacheKey = cache.buildCacheKey({ viewerUserId: input.viewerUserId });
  return createDomainRealtimeApplyPort({
    domain: GROUP_DOMAIN,
    viewerUserId: input.viewerUserId,
    cache,
    cacheKey,
    validatePayload: (envelope) => {
      if (envelope.eventType === "message_created" || envelope.eventType === "message_updated") {
        requireMessagePayload(envelope.payload);
      }
    },
    buildPatch: ({ envelope, current }) => {
      if (envelope.eventType === "room_deleted" || envelope.eventType === "tombstone") {
        return {
          kind: "tombstone",
          tombstone: {
            domain: GROUP_DOMAIN,
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
        const unreadCount = (envelope.payload as { unreadCount: number }).unreadCount;
        if (typeof unreadCount !== "number") {
          throw new DomainEventEnvelopeError("payload_invalid", "unreadCount");
        }
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [{ ...existing, unreadCount, generation: String(envelope.generation) }],
        };
      }
      if (envelope.eventType === "message_created" || envelope.eventType === "message_updated") {
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
      if (envelope.eventType === "group_profile_updated") {
        const p = envelope.payload as { groupName?: string; groupImageUrl?: string | null };
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              groupName: p.groupName ?? existing.groupName,
              groupImageUrl:
                p.groupImageUrl !== undefined ? p.groupImageUrl : existing.groupImageUrl,
              generation: String(envelope.generation),
            },
          ],
        };
      }
      if (envelope.eventType === "membership_changed") {
        const p = envelope.payload as { memberCount?: number };
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              memberCount:
                typeof p.memberCount === "number" ? p.memberCount : existing.memberCount,
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

export type GroupRealtimeApplyPort = ReturnType<typeof createGroupRealtimeApplyPort>;

export function emptyGroupHarnessSnapshot(viewerUserId: string, rows: ReadonlyArray<GroupListItem>) {
  return {
    domain: GROUP_DOMAIN,
    viewerUserId,
    generation: "0",
    schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
    producedAt: new Date().toISOString(),
    rows,
  };
}
