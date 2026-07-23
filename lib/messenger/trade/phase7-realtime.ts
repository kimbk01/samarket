/**
 * Phase 7 — trade RealtimeApplyPort (isolated/test only).
 * Hub contribution 만 재계산. inbox row 삽입 금지.
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
import { buildTradeHubViewModel } from "@/lib/messenger/trade/hub";
import { parseTradeIdentityKey } from "@/lib/messenger/trade/identity";
import { TRADE_DOMAIN, type TradeListItem } from "@/lib/messenger/trade/types";

function requireTradeIdentityParts(envelope: {
  identityKey: string;
  payload: unknown;
}): { itemId: string; sellerId: string; counterpartyId: string } {
  const parts = parseTradeIdentityKey(envelope.identityKey);
  const p = (envelope.payload ?? {}) as Record<string, unknown>;
  const itemId = String(p.itemId ?? parts.itemId).trim();
  const sellerId = String(p.sellerId ?? parts.sellerUserId).trim();
  const counterpartyId = String(p.counterpartyId ?? parts.counterpartyUserId).trim();
  if (!itemId || !sellerId || !counterpartyId) {
    throw new DomainEventEnvelopeError("payload_invalid", "trade_identity_parts");
  }
  if (
    itemId !== parts.itemId ||
    sellerId !== parts.sellerUserId ||
    counterpartyId !== parts.counterpartyUserId
  ) {
    throw new DomainEventEnvelopeError("payload_invalid", "trade_identity_mismatch");
  }
  return { itemId, sellerId, counterpartyId };
}

function requireMessagePayload(payload: unknown) {
  const p = payload as Record<string, unknown>;
  if (typeof p?.messageId !== "string" || !p.messageId.trim()) {
    throw new DomainEventEnvelopeError("payload_invalid", "messageId");
  }
  if (typeof p.text !== "string") {
    throw new DomainEventEnvelopeError("payload_invalid", "text");
  }
  if (typeof p.occurredAt !== "string") {
    throw new DomainEventEnvelopeError("payload_invalid", "occurredAt");
  }
  return {
    messageId: p.messageId.trim(),
    text: p.text,
    occurredAt: p.occurredAt,
    unreadCount: typeof p.unreadCount === "number" ? p.unreadCount : undefined,
  };
}

export function createTradeRealtimeApplyPort(input: {
  viewerUserId: string;
  /** Authority path: inject Phase6 singleton. Default = isolated Map (harness only). */
  cache?: DomainPersistentCachePort<TradeListItem>;
}): DomainRealtimeApplyPort<TradeListItem> {
  const cache =
    input.cache ?? createDomainPersistentCachePort<TradeListItem>(TRADE_DOMAIN, "chat.trade");
  const cacheKey = cache.buildCacheKey({ viewerUserId: input.viewerUserId });
  return createDomainRealtimeApplyPort({
    domain: TRADE_DOMAIN,
    viewerUserId: input.viewerUserId,
    cache,
    cacheKey,
    validatePayload: (envelope) => {
      requireTradeIdentityParts(envelope);
      if (envelope.eventType === "message_created" || envelope.eventType === "message_updated") {
        requireMessagePayload(envelope.payload);
      }
    },
    buildPatch: ({ envelope, current }) => {
      requireTradeIdentityParts(envelope);
      if (envelope.eventType === "room_deleted" || envelope.eventType === "tombstone") {
        return {
          kind: "tombstone",
          tombstone: {
            domain: TRADE_DOMAIN,
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
      if (envelope.eventType === "trade_status_changed") {
        const p = envelope.payload as { tradeStatusLabel?: string };
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              tradeStatusLabel: p.tradeStatusLabel ?? existing.tradeStatusLabel,
              generation: String(envelope.generation),
            },
          ],
        };
      }
      if (envelope.eventType === "item_presentation_changed") {
        const p = envelope.payload as {
          itemTitle?: string;
          itemImageUrl?: string | null;
        };
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              itemTitle: p.itemTitle ?? existing.itemTitle,
              itemImageUrl:
                p.itemImageUrl !== undefined ? p.itemImageUrl : existing.itemImageUrl,
              generation: String(envelope.generation),
            },
          ],
        };
      }
      return { kind: "noop" };
    },
    recomputeHubBadge: ({ rows }) => {
      const hub = buildTradeHubViewModel(rows);
      return {
        hub: {
          ...hub,
          unreadRoomCount: hub.unreadCount,
          latestActivityAt: hub.lastEventAt,
        },
        unreadRoomCount: hub.unreadCount,
      };
    },
  });
}

export type TradeRealtimeApplyPort = ReturnType<typeof createTradeRealtimeApplyPort>;

export function emptyTradeHarnessSnapshot(viewerUserId: string, rows: ReadonlyArray<TradeListItem>) {
  return {
    domain: TRADE_DOMAIN,
    viewerUserId,
    generation: "0",
    schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
    producedAt: new Date().toISOString(),
    rows,
  };
}
