/**
 * DIBAY Room Unread Authority — PARTIAL REBUILD contract (2026-08-01).
 *
 * Verdict: ROOM UNREAD PARTIAL REBUILD REQUIRED
 * DO NOT: FULL NOTIFICATION REBUILD · CURRENT STRUCTURE REPAIRABLE · Phase 8B wiring
 *
 * Authority = stable cursor + deterministic message ordering
 * Projection = community_messenger_participants.unread_count
 *
 * Preserved (out of scope): notification_events, Badge Projection Builder,
 * deep-link, push dispatcher, NativeBadgeSync, App Icon product definition.
 */

import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

/** Product / cutover flags — production cutover only after Room Unread Runtime PASS. */
export const ROOM_UNREAD_AUTHORITY_PARTIAL_REBUILD = true as const;
export const ROOM_UNREAD_AUTHORITY_RUNTIME_PASS = false as const;
export const ROOM_UNREAD_BADGE_PROJECTION_CUTOVER = false as const;
export const PHASE8B_MARK_READ_QUARANTINED = true as const;
export const ROOM_UNREAD_HEAL_FROZEN = true as const;

/** Stable cursor ordering — no room-local sequence column required (v1). */
export const ROOM_UNREAD_CURSOR_ORDER = {
  primary: "created_at",
  tieBreak: "id",
  sqlOrderAsc: "created_at ASC NULLS LAST, id ASC NULLS LAST",
  sqlOrderDesc: "created_at DESC NULLS LAST, id DESC NULLS LAST",
  /** last_read_at is auxiliary only — never sole Authority. */
  timestampAuthority: false,
} as const;

export const DIBAY_MARK_ROOM_READ_ATOMIC_RPC = "dibay_mark_room_read_atomic" as const;
export const DIBAY_APPEND_ROOM_MESSAGE_ATOMIC_RPC = "dibay_append_room_message_atomic" as const;

export const ROOM_UNREAD_AUTHORITY_SQL_MIGRATION =
  "supabase/migrations/20261014120000_dibay_room_unread_authority_v1.sql" as const;

export const ROOM_UNREAD_AUTHORITY_SQL_MIGRATION_V1_1 =
  "supabase/migrations/20261014122000_dibay_append_null_sender_system.sql" as const;

export const ROOM_UNREAD_AUTHORITY_SQL_MIGRATION_V1_1_HARDEN =
  "supabase/migrations/20261014123000_dibay_append_null_sender_system_only.sql" as const;

/** Message types that increment recipient unread projection on append. */
export const ROOM_UNREAD_INCREMENT_MESSAGE_TYPES = [
  "text",
  "image",
  "file",
  "voice",
  "sticker",
  "community_post_share",
  "call_stub",
  "attachment",
] as const;

/**
 * System messages: CM general system does NOT bump (see appendCommunityMessengerSystemMessage).
 * Store-order system bumps via append with p_counts_as_unread=true.
 */
export const ROOM_UNREAD_SYSTEM_DEFAULT_COUNTS = false as const;

export type RoomUnreadViewerRole =
  | "member"
  | "customer"
  | "owner"
  | "buyer"
  | "seller"
  | "admin";

export type MarkRoomReadAtomicArgs = Readonly<{
  p_viewer_id: string;
  p_room_id: string;
  p_chat_domain: ChatDomain;
  p_domain_identity_key: string;
  p_viewer_role: RoomUnreadViewerRole;
  p_store_id?: string | null;
  p_order_id?: string | null;
  p_read_through_message_id?: string | null;
  p_idempotency_key: string;
}>;

/**
 * Canonical unread count (Authority formula).
 * Projection unread_count MUST equal this after every append/mark-read TX.
 */
export function describeCanonicalUnreadFormula(): string {
  return [
    "count(messages m where",
    "  m.room_id = room",
    "  AND m.deleted_at IS NULL",
    "  AND m.sender_id IS DISTINCT FROM viewer",
    "  AND (viewer.left_at IS NULL)",
    "  AND (viewer.joined_at IS NULL OR m.created_at >= viewer.joined_at)",
    "  AND (",
    "    cursor IS NULL",
    "    OR (m.created_at, m.id) > (cursor.created_at, cursor.id)",
    "  )",
    ")",
  ].join("\n");
}

export const ROOM_UNREAD_BANNED_PATTERNS = {
  counterOnlySsot: "participant.unread_count as sole SSOT",
  messageReadsOnlySsot: "message_reads as sole SSOT",
  lastReadAtOnlySsot: "last_read_at as sole SSOT",
  targetsAsUnreadSource: "notification_targets as unread source",
  recipientCursorNullWipe: "last_read_at = null on recipient increment",
  counterOnlyMarkAll: "UPDATE unread_count=0 without cursor",
  storeOrderPromiseAllRead: "Promise.all participant/events/targets without message_reads",
  clientDirectParticipantUpdate: "client/service direct participant unread update",
  phase8bProductionWiring: "dibay_*_atomic_mark_read Phase 8B production wiring",
  alwaysOnHeal: "heal-* as ongoing consistency",
} as const;

export function assertRoomUnreadAuthorityNotUsingPhase8BWiring(
  phase8bProductionWiring: boolean
): void {
  if (phase8bProductionWiring) {
    throw new Error("dibay_room_unread_phase8b_must_remain_quarantined");
  }
}

export function assertBadgeCutoverBlockedUntilRoomUnreadPass(
  runtimePass: boolean,
  cutover: boolean
): void {
  if (cutover && !runtimePass) {
    throw new Error("dibay_badge_cutover_requires_room_unread_runtime_pass");
  }
}
