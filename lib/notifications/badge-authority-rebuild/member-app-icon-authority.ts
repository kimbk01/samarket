/**
 * Member App Icon Authority Projection (canonical).
 *
 * Product Bible: App Icon = |N ∪ C ∪ O|
 *   N = Canonical Notification A
 *   C = Canonical Conversation B (member rooms)
 *   O = Owner Operation (C_store) — same Task ∪1
 * Orphan missed ∈ A only (never re-added).
 * Owner chat rooms (B_store) still excluded from member conversation B.
 */
import type { MemberNotificationAAuthority } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import type { MemberConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";

export const MEMBER_APP_ICON_AUTHORITY = "member_app_icon_authority_v1" as const;

export type MemberAppIconAuthority = Readonly<{
  authority: typeof MEMBER_APP_ICON_AUTHORITY;
  memberKey: `user:${string}`;
  memberNotificationUnread: number;
  generalUnreadRooms: number;
  groupUnreadRooms: number;
  tradeUnreadRooms: number;
  orderUnreadRooms: number;
  memberConversationUnreadRooms: number;
  /** O — owner operation attention (|O|). */
  ownerOperationCount: number;
  appIconTotal: number;
  notificationAuthorityVersion: string;
  conversationAuthorityVersion: string;
  /**
   * Sortable version: `ai1|{rev}|{contentKey}`
   * rev = server projection revision (monotonic). contentKey = deterministic A+B+O fingerprint.
   * Wall-clock computedAt is NOT used for ordering.
   */
  authorityVersion: string;
  computedAt: string;
  /** Canonical A event ids (proof / XOR). */
  notificationEventIds: readonly string[];
  /** Canonical B domain identity keys (proof / XOR). */
  conversationDomainIdentityKeys: readonly string[];
}>;

export type AppIconAuthorityCompare = -1 | 0 | 1;

export type PublishAppIconResult =
  | { ok: true; action: "applied" | "idempotent" }
  | {
      ok: false;
      reason:
        | "STALE_VERSION"
        | "MEMBER_MISMATCH"
        | "PARTIAL_SNAPSHOT"
        | "OWNER_C_FORBIDDEN"
        | "INVALID_SNAPSHOT";
    };

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

function contentKeyFromParts(parts: {
  memberKey: string;
  a: number;
  g: number;
  gr: number;
  t: number;
  o: number;
  op: number;
  eventIds: readonly string[];
  roomKeys: readonly string[];
}): string {
  const events = [...parts.eventIds].map((x) => x.trim()).filter(Boolean).sort().join(",");
  const rooms = [...parts.roomKeys].map((x) => x.trim()).filter(Boolean).sort().join(",");
  return [
    parts.memberKey,
    `a${parts.a}`,
    `g${parts.g}`,
    `gr${parts.gr}`,
    `t${parts.t}`,
    `o${parts.o}`,
    `op${parts.op}`,
    `e:${events}`,
    `r:${rooms}`,
  ].join("|");
}

/** Build sortable authorityVersion. revision from server; 0 when pure/local. */
export function buildMemberAppIconAuthorityVersion(input: {
  revision: number;
  contentKey: string;
}): string {
  const rev = nonNeg(input.revision);
  return `ai1|${rev}|${input.contentKey}`;
}

export function parseMemberAppIconAuthorityVersion(version: string): {
  rev: number;
  contentKey: string;
} | null {
  const v = String(version ?? "").trim();
  if (!v.startsWith("ai1|")) return null;
  const rest = v.slice("ai1|".length);
  const pipe = rest.indexOf("|");
  if (pipe < 0) return null;
  const rev = nonNeg(rest.slice(0, pipe));
  const contentKey = rest.slice(pipe + 1);
  if (!contentKey) return null;
  return { rev, contentKey };
}

/**
 * Version compare (same member assumed by caller).
 * 1) higher server revision wins
 * 2) same revision → contentKey equality (0) or lexicographic for determinism
 */
export function compareMemberAppIconAuthorityVersion(
  incoming: string,
  current: string
): AppIconAuthorityCompare {
  const a = parseMemberAppIconAuthorityVersion(incoming);
  const b = parseMemberAppIconAuthorityVersion(current);
  if (!a || !b) {
    if (incoming === current) return 0;
    return incoming > current ? 1 : -1;
  }
  if (a.rev !== b.rev) return a.rev > b.rev ? 1 : -1;
  if (a.contentKey === b.contentKey) return 0;
  return a.contentKey > b.contentKey ? 1 : -1;
}

export function resolveMemberAppIconAuthority(input: {
  notificationA: MemberNotificationAAuthority;
  conversationB: MemberConversationAuthority;
  /** O — owner operation count (|O|). Default 0. */
  ownerOperationCount?: number;
  /** Server projection revision (badge-count projectionVersionMs). */
  revision?: number;
  computedAt?: string;
}): MemberAppIconAuthority {
  const a = input.notificationA;
  const b = input.conversationB;
  if (a.memberKey !== b.memberKey) {
    throw new Error("APP_ICON_MEMBER_KEY_MISMATCH");
  }
  const memberNotificationUnread = nonNeg(a.unreadCount);
  const generalUnreadRooms = nonNeg(b.generalUnreadRooms);
  const groupUnreadRooms = nonNeg(b.groupUnreadRooms);
  const tradeUnreadRooms = nonNeg(b.tradeUnreadRooms);
  const orderUnreadRooms = nonNeg(b.orderUnreadRooms);
  const memberConversationUnreadRooms =
    generalUnreadRooms + groupUnreadRooms + tradeUnreadRooms + orderUnreadRooms;
  if (memberConversationUnreadRooms !== nonNeg(b.totalUnreadRooms)) {
    throw new Error("APP_ICON_B_TOTAL_MISMATCH");
  }
  const ownerOperationCount = nonNeg(input.ownerOperationCount);
  // |N ∪ C ∪ O| with disjoint namespaces → sum of set sizes
  const appIconTotal =
    memberNotificationUnread + memberConversationUnreadRooms + ownerOperationCount;
  const notificationEventIds = [...a.eventIds];
  const conversationDomainIdentityKeys = b.rooms
    .filter((r) => r.unreadMessageCount > 0)
    .map((r) => r.domainIdentityKey);
  const contentKey = contentKeyFromParts({
    memberKey: a.memberKey,
    a: memberNotificationUnread,
    g: generalUnreadRooms,
    gr: groupUnreadRooms,
    t: tradeUnreadRooms,
    o: orderUnreadRooms,
    op: ownerOperationCount,
    eventIds: notificationEventIds,
    roomKeys: conversationDomainIdentityKeys,
  });
  const computedAt = input.computedAt ?? new Date().toISOString();
  return {
    authority: MEMBER_APP_ICON_AUTHORITY,
    memberKey: a.memberKey,
    memberNotificationUnread,
    generalUnreadRooms,
    groupUnreadRooms,
    tradeUnreadRooms,
    orderUnreadRooms,
    memberConversationUnreadRooms,
    ownerOperationCount,
    appIconTotal,
    notificationAuthorityVersion: a.authorityVersion,
    conversationAuthorityVersion: b.authorityVersion,
    authorityVersion: buildMemberAppIconAuthorityVersion({
      revision: nonNeg(input.revision),
      contentKey,
    }),
    computedAt,
    notificationEventIds,
    conversationDomainIdentityKeys,
  };
}

/** Missed XOR: A event ids must not intersect B room identity keys. */
export function assertAppIconMissedCallXor(snapshot: MemberAppIconAuthority): {
  ok: true;
} | { ok: false; reason: "A_B_IDENTITY_INTERSECT" } {
  const a = new Set(snapshot.notificationEventIds.map((x) => x.trim()).filter(Boolean));
  for (const k of snapshot.conversationDomainIdentityKeys) {
    if (a.has(String(k).trim())) return { ok: false, reason: "A_B_IDENTITY_INTERSECT" };
  }
  return { ok: true };
}

export function assertAppIconSnapshotComplete(
  snap: Partial<MemberAppIconAuthority> | null | undefined
): snap is MemberAppIconAuthority {
  if (!snap || typeof snap !== "object") return false;
  if (snap.authority !== MEMBER_APP_ICON_AUTHORITY) return false;
  if (!snap.memberKey || !String(snap.memberKey).startsWith("user:")) return false;
  if (snap.memberNotificationUnread == null) return false;
  if (snap.generalUnreadRooms == null || snap.groupUnreadRooms == null) return false;
  if (snap.tradeUnreadRooms == null || snap.orderUnreadRooms == null) return false;
  if (snap.memberConversationUnreadRooms == null || snap.appIconTotal == null) return false;
  if (!snap.authorityVersion || !snap.notificationAuthorityVersion) return false;
  if (!snap.conversationAuthorityVersion || !snap.computedAt) return false;
  const bSum =
    nonNeg(snap.generalUnreadRooms) +
    nonNeg(snap.groupUnreadRooms) +
    nonNeg(snap.tradeUnreadRooms) +
    nonNeg(snap.orderUnreadRooms);
  if (bSum !== nonNeg(snap.memberConversationUnreadRooms)) return false;
  const op = nonNeg(snap.ownerOperationCount);
  if (
    nonNeg(snap.appIconTotal) !==
    nonNeg(snap.memberNotificationUnread) + nonNeg(snap.memberConversationUnreadRooms) + op
  ) {
    return false;
  }
  return true;
}

/**
 * Snapshot-unit publish gate (pure). Native/UI adapters call this before echo.
 * Never merges partial A or B into current.
 */
export function publishMemberAppIconAuthority(
  incoming: MemberAppIconAuthority,
  current: MemberAppIconAuthority | null,
  opts?: {
    /** Owner chat rooms still forbidden in member Icon. */
    ownerStoreOrderUnreadRooms?: number;
    /** O count — must match incoming.ownerOperationCount when set. */
    storeActionRequiredCount?: number;
  }
): PublishAppIconResult {
  if (!assertAppIconSnapshotComplete(incoming)) {
    return { ok: false, reason: "PARTIAL_SNAPSHOT" };
  }
  if (nonNeg(opts?.ownerStoreOrderUnreadRooms) > 0) {
    return { ok: false, reason: "OWNER_C_FORBIDDEN" };
  }
  if (
    opts?.storeActionRequiredCount != null &&
    nonNeg(opts.storeActionRequiredCount) !== nonNeg(incoming.ownerOperationCount)
  ) {
    return { ok: false, reason: "OWNER_C_FORBIDDEN" };
  }
  if (!current) return { ok: true, action: "applied" };
  if (incoming.memberKey !== current.memberKey) {
    return { ok: false, reason: "MEMBER_MISMATCH" };
  }
  const cmp = compareMemberAppIconAuthorityVersion(
    incoming.authorityVersion,
    current.authorityVersion
  );
  if (cmp < 0) return { ok: false, reason: "STALE_VERSION" };
  if (cmp === 0) return { ok: true, action: "idempotent" };
  return { ok: true, action: "applied" };
}

/** Logout / member switch — clear previous member projection. */
export function clearMemberAppIconAuthority(
  current: MemberAppIconAuthority | null
): MemberAppIconAuthority | null {
  void current;
  return null;
}

/** Cached paint may show; cannot overwrite newer canonical. */
export function reconcileCachedAppIconWithCanonical(input: {
  cached: MemberAppIconAuthority | null;
  canonical: MemberAppIconAuthority;
}): PublishAppIconResult & { snapshot: MemberAppIconAuthority | null } {
  const pub = publishMemberAppIconAuthority(input.canonical, input.cached);
  if (!pub.ok) {
    return { ...pub, snapshot: input.cached };
  }
  return { ...pub, snapshot: input.canonical };
}

/** Native echo contract: absolute total only; zero clears. */
export function nativeAppIconEchoFromAuthority(
  snap: MemberAppIconAuthority | null
): { mode: "absolute_replace"; total: number; clear: boolean } {
  const total = snap ? nonNeg(snap.appIconTotal) : 0;
  return { mode: "absolute_replace", total, clear: total === 0 };
}
