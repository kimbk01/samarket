/**
 * Phase 7 — Domain Realtime / Multi-tab Event Envelope SSOT.
 * production channel/bus wiring 금지. isolated harness · 테스트만.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { isChatDomain, requireChatDomain } from "@/lib/chat-domain/chat-domain";

export const MESSENGER_DOMAIN_EVENT_SCHEMA_VERSION = 1 as const;

export const PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING = false as const;

export type DomainEventTypeGeneral =
  | "message_created"
  | "message_updated"
  | "room_read"
  | "unread_changed"
  | "participant_updated"
  | "room_deleted"
  | "tombstone";

export type DomainEventTypeGroup =
  | "message_created"
  | "message_updated"
  | "room_read"
  | "unread_changed"
  | "membership_changed"
  | "group_profile_updated"
  | "room_deleted"
  | "tombstone";

export type DomainEventTypeTrade =
  | "message_created"
  | "message_updated"
  | "room_read"
  | "unread_changed"
  | "trade_status_changed"
  | "item_presentation_changed"
  | "room_deleted"
  | "tombstone";

export type DomainEventTypeStoreOrder =
  | "message_created"
  | "message_updated"
  | "room_read"
  | "unread_changed"
  | "order_status_changed"
  | "store_presentation_changed"
  | "customer_presentation_changed"
  | "room_deleted"
  | "tombstone";

export type DomainEventType =
  | DomainEventTypeGeneral
  | DomainEventTypeGroup
  | DomainEventTypeTrade
  | DomainEventTypeStoreOrder;

export type MessengerDomainEventEnvelope = Readonly<{
  schemaVersion: number;
  domain: ChatDomain;
  identityKey: string;
  roomId: string;
  viewerUserId: string;
  eventId: string;
  generation: number;
  occurredAt: string;
  eventType: DomainEventType;
  payload: unknown;
}>;

const EVENT_TYPES_BY_DOMAIN: Record<ChatDomain, ReadonlySet<string>> = {
  general_direct: new Set([
    "message_created",
    "message_updated",
    "room_read",
    "unread_changed",
    "participant_updated",
    "room_deleted",
    "tombstone",
  ]),
  group: new Set([
    "message_created",
    "message_updated",
    "room_read",
    "unread_changed",
    "membership_changed",
    "group_profile_updated",
    "room_deleted",
    "tombstone",
  ]),
  trade: new Set([
    "message_created",
    "message_updated",
    "room_read",
    "unread_changed",
    "trade_status_changed",
    "item_presentation_changed",
    "room_deleted",
    "tombstone",
  ]),
  store_order: new Set([
    "message_created",
    "message_updated",
    "room_read",
    "unread_changed",
    "order_status_changed",
    "store_presentation_changed",
    "customer_presentation_changed",
    "room_deleted",
    "tombstone",
  ]),
};

export function assertEventTypeBelongsToDomain(domain: ChatDomain, eventType: string): void {
  if (!EVENT_TYPES_BY_DOMAIN[domain].has(eventType)) {
    throw new Error(`dibay_domain_event_type_foreign:${domain}:${eventType}`);
  }
}

export function assertIdentityPrefixMatchesDomain(domain: ChatDomain, identityKey: string): void {
  const key = identityKey.trim();
  if (!key.startsWith(`${domain}:`)) {
    throw new Error(`dibay_domain_event_identity_prefix_mismatch:${domain}`);
  }
}

export type EnvelopeRejectReason =
  | "missing_field"
  | "unsupported_schema"
  | "domain_identity_mismatch"
  | "viewer_mismatch"
  | "foreign_event_type"
  | "invalid_generation"
  | "legacy_quarantine"
  | "payload_invalid";

export class DomainEventEnvelopeError extends Error {
  readonly reason: EnvelopeRejectReason;
  constructor(reason: EnvelopeRejectReason, detail: string) {
    super(`dibay_domain_event_${reason}:${detail}`);
    this.reason = reason;
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DomainEventEnvelopeError("missing_field", field);
  }
  return value.trim();
}

/**
 * raw → 검증된 Envelope. 누락·불일치 시 throw (fallback Domain 금지).
 */
export function parseMessengerDomainEventEnvelope(
  raw: unknown,
  expected?: { domain?: ChatDomain; viewerUserId?: string }
): MessengerDomainEventEnvelope {
  if (raw == null || typeof raw !== "object") {
    throw new DomainEventEnvelopeError("missing_field", "envelope");
  }
  const o = raw as Record<string, unknown>;

  // legacy roomId-only / unread-only → quarantine
  if (
    ("roomId" in o || "room_id" in o) &&
    !("domain" in o) &&
    !("eventId" in o) &&
    !("generation" in o)
  ) {
    throw new DomainEventEnvelopeError("legacy_quarantine", "roomId_only");
  }

  const schemaVersion = o.schemaVersion;
  if (typeof schemaVersion !== "number" || !Number.isFinite(schemaVersion)) {
    throw new DomainEventEnvelopeError("missing_field", "schemaVersion");
  }
  if (schemaVersion !== MESSENGER_DOMAIN_EVENT_SCHEMA_VERSION) {
    throw new DomainEventEnvelopeError("unsupported_schema", String(schemaVersion));
  }

  const domain = requireChatDomain(o.domain);
  if (expected?.domain && domain !== expected.domain) {
    throw new DomainEventEnvelopeError("domain_identity_mismatch", `expected:${expected.domain}`);
  }

  const identityKey = requireNonEmptyString(o.identityKey, "identityKey");
  assertIdentityPrefixMatchesDomain(domain, identityKey);

  const roomId = requireNonEmptyString(o.roomId, "roomId");
  const viewerUserId = requireNonEmptyString(o.viewerUserId, "viewerUserId");
  if (expected?.viewerUserId && viewerUserId !== expected.viewerUserId.trim()) {
    throw new DomainEventEnvelopeError("viewer_mismatch", viewerUserId);
  }

  const eventId = requireNonEmptyString(o.eventId, "eventId");
  const generation = o.generation;
  if (typeof generation !== "number" || !Number.isFinite(generation) || generation < 0) {
    throw new DomainEventEnvelopeError("invalid_generation", String(generation));
  }

  const occurredAt = requireNonEmptyString(o.occurredAt, "occurredAt");
  const eventType = requireNonEmptyString(o.eventType, "eventType");
  assertEventTypeBelongsToDomain(domain, eventType);

  if (!("payload" in o)) {
    throw new DomainEventEnvelopeError("missing_field", "payload");
  }

  return {
    schemaVersion,
    domain,
    identityKey,
    roomId,
    viewerUserId,
    eventId,
    generation,
    occurredAt,
    eventType: eventType as DomainEventType,
    payload: o.payload,
  };
}

export function isMessengerDomainEventEnvelope(raw: unknown): raw is MessengerDomainEventEnvelope {
  try {
    parseMessengerDomainEventEnvelope(raw);
    return true;
  } catch {
    return false;
  }
}

export function assertPhase7RealtimeProductionWiringOff(): void {
  if (PHASE7_DOMAIN_REALTIME_PRODUCTION_WIRING) {
    throw new Error("dibay_phase7_realtime_production_wiring_must_remain_false");
  }
}

export function assertRawIsNotDomainInference(
  raw: Record<string, unknown>
): void {
  // 신규 Phase7 파서는 roomType/direct_key/contextMeta 로 Domain 을 정하지 않는다.
  void raw;
  if (!isChatDomain(raw.domain)) {
    throw new DomainEventEnvelopeError("missing_field", "domain");
  }
}
