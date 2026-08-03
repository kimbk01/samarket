/**
 * Slice 2-3 / Gate 3 Step 5 — Member Communication B projection (pure).
 *
 * Gate 3 Conversation B (canonical rooms only):
 *   resolveMemberConversationAuthority → B_general+B_group+B_trade+B_order
 *
 * Slice 2-3 App Icon path still uses rooms + unresolved missed until Step 6
 * (ADAPTER — not Gate 3 Conversation B authority).
 *
 * DO NOT include owner store_order rooms, B_store, or C_store.
 * DO NOT drive Bell (Bell = A_member only).
 * Native / FCM / App Icon wiring — Step 6; do not import android/ios/push here.
 */
import {
  asUnreadRoomCount,
  asUnresolvedMissedCallCount,
  asUnreadNotificationCount,
  type UnreadRoomCount,
  type UnresolvedMissedCallCount,
  type UnreadNotificationCount,
} from "@/lib/notifications/badge-authority-rebuild/badge-count-units";
import {
  memberBUnreadRoomCount,
  unresolvedMissedCallCountFromCallIds,
  type MemberBRoomBuckets,
} from "@/lib/notifications/badge-authority-rebuild/phase1-authority-contract";
import {
  projectSurfacesFromConversationAuthority,
  resolveMemberConversationAuthority,
  type MemberConversationAuthority,
  type MemberConversationRoomInput,
} from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";

export {
  resolveMemberConversationAuthority,
  projectSurfacesFromConversationAuthority,
  applyIncomingMessageToConversationRooms,
  applyReadAckToConversationRooms,
  assertMissedCallXorWithConversationB,
  type MemberConversationAuthority,
  type MemberConversationRoomInput,
} from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";

export const MEMBER_COMMUNICATION_B_PROJECTION =
  "member_communication_b_projection_v1" as const;

export type MemberCommunicationBParts = Readonly<{
  authority: typeof MEMBER_COMMUNICATION_B_PROJECTION;
  memberUnreadRoomCount: UnreadRoomCount;
  memberUnresolvedMissedCallCount: UnresolvedMissedCallCount;
  /** B_member item total (rooms + unresolved missed). */
  bMemberTotal: number;
}>;

export type MemberAppIconWebProjection = Readonly<{
  authority: typeof MEMBER_COMMUNICATION_B_PROJECTION;
  aMemberUnreadNotificationCount: UnreadNotificationCount;
  memberUnreadRoomCount: UnreadRoomCount;
  memberUnresolvedMissedCallCount: UnresolvedMissedCallCount;
  /** A_member + B_member — web/server only until Slice 2-6 Native. */
  memberAppIconWebTotal: number;
}>;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

/**
 * Room counts for Member B — owner store_order excluded by construction
 * (caller must not pass owner into these fields).
 * Domains: General + Group + Trade + Customer Store Order.
 */
export function deriveMemberUnreadRoomCount(input: {
  generalDirectUnreadRooms: number;
  groupUnreadRooms: number;
  tradeUnreadRooms: number;
  customerStoreOrderUnreadRooms: number;
}): UnreadRoomCount {
  return asUnreadRoomCount(
    nonNeg(input.generalDirectUnreadRooms) +
      nonNeg(input.groupUnreadRooms) +
      nonNeg(input.tradeUnreadRooms) +
      nonNeg(input.customerStoreOrderUnreadRooms)
  );
}

/** Same as deriveMemberUnreadRoomCount but from id buckets (dedupe across bags). */
export function deriveMemberUnreadRoomCountFromBuckets(
  buckets: MemberBRoomBuckets
): UnreadRoomCount {
  return memberBUnreadRoomCount(buckets);
}

/**
 * Unresolved missed calls: at most one per call_id / session id.
 * Prefer explicit callIds; else fall back to orphan event count (legacy Fact).
 */
export function deriveMemberUnresolvedMissedCallCount(input: {
  callIds?: readonly string[];
  /** Legacy orphan missed_call event count when call ids unavailable. */
  orphanMissedCallCount?: number;
}): UnresolvedMissedCallCount {
  if (input.callIds && input.callIds.length > 0) {
    return unresolvedMissedCallCountFromCallIds(input.callIds);
  }
  return asUnresolvedMissedCallCount(nonNeg(input.orphanMissedCallCount));
}

export function buildMemberCommunicationBProjection(input: {
  generalDirectUnreadRooms: number;
  groupUnreadRooms: number;
  tradeUnreadRooms: number;
  customerStoreOrderUnreadRooms: number;
  callIds?: readonly string[];
  orphanMissedCallCount?: number;
}): MemberCommunicationBParts {
  const rooms = asUnreadRoomCount(
    nonNeg(input.generalDirectUnreadRooms) +
      nonNeg(input.groupUnreadRooms) +
      nonNeg(input.tradeUnreadRooms) +
      nonNeg(input.customerStoreOrderUnreadRooms)
  );
  const missed = deriveMemberUnresolvedMissedCallCount({
    callIds: input.callIds,
    orphanMissedCallCount: input.orphanMissedCallCount,
  });
  return {
    authority: MEMBER_COMMUNICATION_B_PROJECTION,
    memberUnreadRoomCount: rooms,
    memberUnresolvedMissedCallCount: missed,
    bMemberTotal: rooms + missed,
  };
}

/**
 * Member App Icon web/server total = A + Conversation B rooms (Gate 3 Step 6).
 * Orphan missed must already be inside A — not added via B_missed here.
 * Rejects contaminated inputs that try to fold B_store / C_store into the member total.
 */
export function buildMemberAppIconWebProjection(input: {
  aMemberUnreadNotificationCount: number;
  generalDirectUnreadRooms: number;
  groupUnreadRooms: number;
  tradeUnreadRooms: number;
  customerStoreOrderUnreadRooms: number;
  callIds?: readonly string[];
  orphanMissedCallCount?: number;
  /** Contaminated — must stay 0 / omitted. */
  ownerStoreOrderUnreadRooms?: number;
  storeActionRequiredCount?: number;
}):
  | { ok: true; projection: MemberAppIconWebProjection }
  | {
      ok: false;
      reason:
        | "OWNER_STORE_ORDER_FORBIDDEN_IN_MEMBER_APP_ICON"
        | "C_STORE_FORBIDDEN_IN_MEMBER_APP_ICON";
    } {
  if (nonNeg(input.ownerStoreOrderUnreadRooms) > 0) {
    return { ok: false, reason: "OWNER_STORE_ORDER_FORBIDDEN_IN_MEMBER_APP_ICON" };
  }
  if (nonNeg(input.storeActionRequiredCount) > 0) {
    return { ok: false, reason: "C_STORE_FORBIDDEN_IN_MEMBER_APP_ICON" };
  }
  const b = buildMemberCommunicationBProjection({
    generalDirectUnreadRooms: input.generalDirectUnreadRooms,
    groupUnreadRooms: input.groupUnreadRooms,
    tradeUnreadRooms: input.tradeUnreadRooms,
    customerStoreOrderUnreadRooms: input.customerStoreOrderUnreadRooms,
    callIds: input.callIds,
    orphanMissedCallCount: input.orphanMissedCallCount,
  });
  const a = asUnreadNotificationCount(input.aMemberUnreadNotificationCount);
  return {
    ok: true,
    projection: {
      authority: MEMBER_COMMUNICATION_B_PROJECTION,
      aMemberUnreadNotificationCount: a,
      memberUnreadRoomCount: b.memberUnreadRoomCount,
      /** Diagnostic only — not part of App Icon total (orphan ∈ A). */
      memberUnresolvedMissedCallCount: b.memberUnresolvedMissedCallCount,
      memberAppIconWebTotal: a + b.memberUnreadRoomCount,
    },
  };
}

/**
 * Bottom Chat = unread General rooms + unread Group rooms only.
 * Prefer projectSurfacesFromConversationAuthority(canonical B).
 */
export function projectMemberBottomChatBadge(input: {
  generalDirectUnreadRooms: number;
  groupUnreadRooms: number;
}): number {
  return nonNeg(input.generalDirectUnreadRooms) + nonNeg(input.groupUnreadRooms);
}

export function projectMemberTradeHubBadge(tradeUnreadRooms: number): number {
  return nonNeg(tradeUnreadRooms);
}

export function projectMemberCustomerOrderHubBadge(
  customerStoreOrderUnreadRooms: number
): number {
  return nonNeg(customerStoreOrderUnreadRooms);
}

/** Surfaces from one canonical B authority (Step 5 contract). */
export function projectMemberConversationSurfacesFromRooms(
  memberId: string,
  rooms: readonly MemberConversationRoomInput[]
): {
  authority: MemberConversationAuthority;
  bottomChat: number;
  tradeHub: number;
  orderHub: number;
  conversationB: number;
} {
  const authority = resolveMemberConversationAuthority(memberId, rooms);
  const surfaces = projectSurfacesFromConversationAuthority(authority);
  return { authority, ...surfaces };
}

/**
 * Extract call/session id for missed-call dedupe from event row fields.
 * Prefer call_session_id / sessionId payload; else parse `missed:{session}:{user}`.
 */
export function resolveMissedCallIdForBMember(row: {
  dedupe_key?: string | null;
  call_session_id?: string | null;
  display_payload?: unknown;
}): string | null {
  const sessionCol = String(row.call_session_id ?? "").trim();
  if (sessionCol) return sessionCol;

  const payload =
    row.display_payload && typeof row.display_payload === "object"
      ? (row.display_payload as Record<string, unknown>)
      : null;
  for (const k of ["call_session_id", "callSessionId", "session_id", "sessionId", "call_id", "callId"]) {
    const v = payload?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  const dedupe = String(row.dedupe_key ?? "").trim();
  const m = /^missed:([^:]+):/.exec(dedupe);
  if (m?.[1]) return m[1];
  if (dedupe) return dedupe;
  return null;
}
