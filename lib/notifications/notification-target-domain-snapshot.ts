/**
 * notification_targets Domain snapshot contract (writer + RPC mirror).
 *
 * Authority: community_messenger_rooms.chat_domain + domain_identity_key only.
 * DO NOT: peer/direct_key/target_type inference, general_direct default, partial COALESCE.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  provenCanonicalRoomDomainEnvelopeFromDbRow,
  type RoomDomainEnvelope,
} from "@/lib/chat-domain/room-domain-envelope";
import type { NotificationTargetType } from "@/lib/notifications/badge-target-policy";

/** Room-linked targets eligible for Domain snapshot when p_room_id (or chat_room id) resolves. */
export const ROOM_BASED_NOTIFICATION_TARGET_TYPES = new Set<NotificationTargetType>([
  "chat_room",
  "owner_order_chat",
  "trade",
  "buyer_order",
]);

export function isRoomBasedNotificationTargetType(
  targetType: string | null | undefined
): targetType is NotificationTargetType {
  const t = String(targetType ?? "").trim();
  return ROOM_BASED_NOTIFICATION_TARGET_TYPES.has(t as NotificationTargetType);
}

export type ExistingTargetDomainFields = {
  chatDomain: string | null;
  domainIdentityKey: string | null;
};

export type NotificationTargetDomainSnapshotDecision =
  | {
      action: "write";
      chatDomain: ChatDomain;
      domainIdentityKey: string;
      reason: "insert" | "fill_null_pair";
    }
  | { action: "keep"; reason: "already_matched" | "non_null_preserved" }
  | { action: "skip"; reason: "non_room_target" | "room_incomplete" | "room_not_found" }
  | { action: "skip"; reason: "partial_existing" }
  | {
      action: "skip";
      reason: "domain_mismatch";
      existing: { chatDomain: string; domainIdentityKey: string };
      room: { chatDomain: ChatDomain; domainIdentityKey: string };
    };

function trimOrNull(v: string | null | undefined): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}

export function classifyExistingTargetDomainPair(
  existing: ExistingTargetDomainFields | null | undefined
): "absent" | "both_null" | "both_present" | "partial" {
  if (!existing) return "absent";
  const d = trimOrNull(existing.chatDomain);
  const k = trimOrNull(existing.domainIdentityKey);
  if (!d && !k) return "both_null";
  if (d && k) return "both_present";
  return "partial";
}

/**
 * Pure decision for INSERT/UPDATE Domain pair — mirrors upsert_notification_target_unread.
 */
export function decideNotificationTargetDomainSnapshot(input: {
  targetType: string;
  existing: ExistingTargetDomainFields | null;
  roomEnvelope: RoomDomainEnvelope | null;
}): NotificationTargetDomainSnapshotDecision {
  if (!isRoomBasedNotificationTargetType(input.targetType)) {
    return { action: "skip", reason: "non_room_target" };
  }
  if (!input.roomEnvelope) {
    return { action: "skip", reason: "room_incomplete" };
  }

  const room = {
    chatDomain: input.roomEnvelope.chatDomain,
    domainIdentityKey: input.roomEnvelope.domainIdentityKey,
  };
  const pairClass = classifyExistingTargetDomainPair(input.existing);

  if (pairClass === "absent" || pairClass === "both_null") {
    return {
      action: "write",
      chatDomain: room.chatDomain,
      domainIdentityKey: room.domainIdentityKey,
      reason: pairClass === "absent" ? "insert" : "fill_null_pair",
    };
  }

  if (pairClass === "partial") {
    return { action: "skip", reason: "partial_existing" };
  }

  const existingDomain = trimOrNull(input.existing!.chatDomain)!;
  const existingKey = trimOrNull(input.existing!.domainIdentityKey)!;
  if (existingDomain === room.chatDomain && existingKey === room.domainIdentityKey) {
    return { action: "keep", reason: "already_matched" };
  }
  return {
    action: "skip",
    reason: "domain_mismatch",
    existing: { chatDomain: existingDomain, domainIdentityKey: existingKey },
    room,
  };
}

/** Room row → proven envelope or null (no invent). */
export function resolveRoomDomainEnvelopeForTargetSnapshot(row: {
  id?: unknown;
  chat_domain?: unknown;
  domain_identity_key?: unknown;
  domain_identity?: unknown;
} | null): RoomDomainEnvelope | null {
  if (!row) return null;
  return provenCanonicalRoomDomainEnvelopeFromDbRow(row);
}
