/**
 * Phase 7 — store_order RealtimeApplyPort (isolated/test only).
 * surfaceRole 필수 · customer/owner cache key 분리 · Hub만 재계산.
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
import type { StoreOrderSurfaceRole } from "@/lib/messenger/store-order/phase6-bootstrap";
import { buildStoreOrderHubViewModel } from "@/lib/messenger/store-order/hub";
import { parseStoreOrderIdentityKey } from "@/lib/messenger/store-order/identity";
import { STORE_ORDER_DOMAIN, type StoreOrderListItem } from "@/lib/messenger/store-order/types";

export type StoreOrderEventPayloadBase = Readonly<{
  orderId: string;
  storeId: string;
  surfaceRole: StoreOrderSurfaceRole;
  messageId?: string;
  text?: string;
  occurredAt?: string;
  unreadCount?: number;
  orderStatusLabel?: string;
  storeName?: string;
  storeImageUrl?: string | null;
  customerName?: string;
  customerAvatarUrl?: string | null;
}>;

function requireStoreOrderPayload(
  payload: unknown,
  expectedSurface: StoreOrderSurfaceRole
): StoreOrderEventPayloadBase {
  if (payload == null || typeof payload !== "object") {
    throw new DomainEventEnvelopeError("payload_invalid", "store_order_payload");
  }
  const p = payload as Record<string, unknown>;
  const surfaceRole = p.surfaceRole;
  if (surfaceRole !== "customer" && surfaceRole !== "owner") {
    throw new DomainEventEnvelopeError("payload_invalid", "surfaceRole");
  }
  if (surfaceRole !== expectedSurface) {
    throw new DomainEventEnvelopeError("payload_invalid", "surfaceRole_mismatch");
  }
  if (typeof p.orderId !== "string" || !p.orderId.trim()) {
    throw new DomainEventEnvelopeError("payload_invalid", "orderId");
  }
  if (typeof p.storeId !== "string" || !p.storeId.trim()) {
    throw new DomainEventEnvelopeError("payload_invalid", "storeId");
  }
  return {
    orderId: p.orderId.trim(),
    storeId: p.storeId.trim(),
    surfaceRole,
    messageId: typeof p.messageId === "string" ? p.messageId : undefined,
    text: typeof p.text === "string" ? p.text : undefined,
    occurredAt: typeof p.occurredAt === "string" ? p.occurredAt : undefined,
    unreadCount: typeof p.unreadCount === "number" ? p.unreadCount : undefined,
    orderStatusLabel: typeof p.orderStatusLabel === "string" ? p.orderStatusLabel : undefined,
    storeName: typeof p.storeName === "string" ? p.storeName : undefined,
    storeImageUrl:
      p.storeImageUrl === null || typeof p.storeImageUrl === "string"
        ? (p.storeImageUrl as string | null)
        : undefined,
    customerName: typeof p.customerName === "string" ? p.customerName : undefined,
    customerAvatarUrl:
      p.customerAvatarUrl === null || typeof p.customerAvatarUrl === "string"
        ? (p.customerAvatarUrl as string | null)
        : undefined,
  };
}

export function createStoreOrderRealtimeApplyPort(input: {
  viewerUserId: string;
  surfaceRole: StoreOrderSurfaceRole;
  /** Authority path: inject Phase6 singleton. Default = isolated Map (harness only). */
  cache?: DomainPersistentCachePort<StoreOrderListItem>;
}): DomainRealtimeApplyPort<StoreOrderListItem> {
  const cache =
    input.cache ??
    createDomainPersistentCachePort<StoreOrderListItem>(STORE_ORDER_DOMAIN, "chat.store_order");
  const cacheKey = cache.buildCacheKey({
    viewerUserId: input.viewerUserId,
    surfaceRole: input.surfaceRole,
  });

  return createDomainRealtimeApplyPort({
    domain: STORE_ORDER_DOMAIN,
    viewerUserId: input.viewerUserId,
    cache,
    cacheKey,
    validatePayload: (envelope) => {
      const body = requireStoreOrderPayload(envelope.payload, input.surfaceRole);
      const { orderId } = parseStoreOrderIdentityKey(envelope.identityKey);
      if (body.orderId !== orderId) {
        throw new DomainEventEnvelopeError("payload_invalid", "orderId_mismatch");
      }
      if (input.surfaceRole === "customer") {
        if (envelope.eventType === "customer_presentation_changed") {
          throw new DomainEventEnvelopeError("payload_invalid", "customer_surface_forbids_customer_presentation");
        }
        if (body.customerName || body.customerAvatarUrl) {
          // customer surface 는 peer 회원 identity 갱신 금지
          if (envelope.eventType === "store_presentation_changed") {
            throw new DomainEventEnvelopeError("payload_invalid", "customer_peer_identity_forbidden");
          }
        }
      }
      if (input.surfaceRole === "owner") {
        if (envelope.eventType === "store_presentation_changed") {
          throw new DomainEventEnvelopeError("payload_invalid", "owner_surface_forbids_store_as_peer");
        }
      }
    },
    buildPatch: ({ envelope, current }) => {
      const body = requireStoreOrderPayload(envelope.payload, input.surfaceRole);
      if (envelope.eventType === "room_deleted" || envelope.eventType === "tombstone") {
        return {
          kind: "tombstone",
          tombstone: {
            domain: STORE_ORDER_DOMAIN,
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
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing || body.unreadCount === undefined) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              unreadCount: body.unreadCount,
              generation: String(envelope.generation),
            },
          ],
        };
      }
      if (envelope.eventType === "message_created" || envelope.eventType === "message_updated") {
        if (!body.messageId || body.text === undefined || !body.occurredAt) {
          throw new DomainEventEnvelopeError("payload_invalid", "message_fields");
        }
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              latestChatMessageText: body.text,
              latestChatMessageAt: body.occurredAt,
              unreadCount:
                body.unreadCount !== undefined ? body.unreadCount : existing.unreadCount,
              generation: String(envelope.generation),
            },
          ],
        };
      }
      if (envelope.eventType === "order_status_changed") {
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              orderStatusLabel: body.orderStatusLabel ?? existing.orderStatusLabel,
              generation: String(envelope.generation),
            },
          ],
        };
      }
      if (envelope.eventType === "store_presentation_changed") {
        if (input.surfaceRole !== "customer") {
          throw new DomainEventEnvelopeError("payload_invalid", "store_presentation_customer_only");
        }
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              storeName: body.storeName ?? existing.storeName,
              storeImageUrl:
                body.storeImageUrl !== undefined ? body.storeImageUrl : existing.storeImageUrl,
              generation: String(envelope.generation),
            },
          ],
        };
      }
      if (envelope.eventType === "customer_presentation_changed") {
        if (input.surfaceRole !== "owner") {
          throw new DomainEventEnvelopeError("payload_invalid", "customer_presentation_owner_only");
        }
        const existing = current?.rows.find((r) => r.roomId === envelope.roomId);
        if (!existing) return { kind: "noop" };
        return {
          kind: "partial",
          rows: [
            {
              ...existing,
              customerName: body.customerName ?? existing.customerName,
              customerAvatarUrl:
                body.customerAvatarUrl !== undefined
                  ? body.customerAvatarUrl
                  : existing.customerAvatarUrl,
              generation: String(envelope.generation),
            },
          ],
        };
      }
      return { kind: "noop" };
    },
    recomputeHubBadge: ({ rows }) => {
      const hub = buildStoreOrderHubViewModel(rows);
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

export type StoreOrderRealtimeApplyPort = ReturnType<typeof createStoreOrderRealtimeApplyPort>;

export function emptyStoreOrderHarnessSnapshot(
  viewerUserId: string,
  surfaceRole: StoreOrderSurfaceRole,
  rows: ReadonlyArray<StoreOrderListItem>
) {
  return {
    domain: STORE_ORDER_DOMAIN,
    viewerUserId,
    generation: "0",
    schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
    producedAt: new Date().toISOString(),
    rows,
    surfaceRole,
  };
}
