/**
 * Phase 2A — Unread cursor truth audit design (pure fixtures only).
 * DO NOT import from product Projection Authority / Hub / Native.
 */
export type UnreadTruthRecipientIdentity =
  | `user:${string}`
  | `store:${string}`;

export type UnreadTruthDomain =
  | "general_direct"
  | "group"
  | "trade"
  | "customer_store_order"
  | "owner_store_order";

export type UnreadTruthRoomInput = Readonly<{
  recipientIdentity: UnreadTruthRecipientIdentity;
  domain: UnreadTruthDomain;
  roomId: string;
  latestReadableMessageId: string | null;
  readCursorMessageId: string | null;
  /** Messages after cursor, excluding self / non-readable — derived truth. */
  derivedUnreadMessageCount: number;
  cachedUnreadMessageCount: number;
  projectedUnreadRoomMembership: boolean;
}>;

export type UnreadTruthCompareResult = Readonly<{
  truthUnreadMessageCount: number;
  truthUnreadRoom: boolean;
  projectionUnreadMessageCount: number;
  projectionUnreadRoom: boolean;
  status: "match" | "mismatch";
  mismatchReason: string | null;
}>;

export function deriveUnreadTruthForRoom(input: {
  derivedUnreadMessageCount: number;
}): { truthUnreadMessageCount: number; truthUnreadRoom: boolean } {
  const n = Math.max(0, Math.floor(Number(input.derivedUnreadMessageCount) || 0));
  return { truthUnreadMessageCount: n, truthUnreadRoom: n > 0 };
}

export function compareUnreadTruthToProjection(
  input: UnreadTruthRoomInput
): UnreadTruthCompareResult {
  const truth = deriveUnreadTruthForRoom({
    derivedUnreadMessageCount: input.derivedUnreadMessageCount,
  });
  const projectionUnreadMessageCount = Math.max(
    0,
    Math.floor(Number(input.cachedUnreadMessageCount) || 0)
  );
  const projectionUnreadRoom = Boolean(input.projectedUnreadRoomMembership);

  let mismatchReason: string | null = null;
  if (truth.truthUnreadMessageCount !== projectionUnreadMessageCount) {
    mismatchReason = "message_count_mismatch";
  } else if (truth.truthUnreadRoom !== projectionUnreadRoom) {
    mismatchReason = truth.truthUnreadRoom
      ? "room_missing_from_projection_set"
      : "room_present_in_projection_set_but_truth_zero";
  }

  return {
    truthUnreadMessageCount: truth.truthUnreadMessageCount,
    truthUnreadRoom: truth.truthUnreadRoom,
    projectionUnreadMessageCount,
    projectionUnreadRoom,
    status: mismatchReason ? "mismatch" : "match",
    mismatchReason,
  };
}

/** Detect duplicate room membership across alias / identity / domain bags. */
export function auditUnreadProjectionForIdentity(input: {
  canonicalRoomId: string;
  membershipKeys: readonly string[];
}): { ok: boolean; duplicateCount: number; reason: string | null } {
  const canon = String(input.canonicalRoomId ?? "").trim().toLowerCase();
  const hits = input.membershipKeys
    .map((k) => String(k ?? "").trim().toLowerCase())
    .filter((k) => k === canon || k.endsWith(`:${canon}`) || k.includes(canon));
  const unique = new Set(hits);
  if (unique.size <= 1 && hits.length <= 1) {
    return { ok: true, duplicateCount: hits.length, reason: null };
  }
  if (hits.length > 1) {
    return {
      ok: false,
      duplicateCount: hits.length,
      reason: "duplicate_room_membership",
    };
  }
  return { ok: true, duplicateCount: hits.length, reason: null };
}
