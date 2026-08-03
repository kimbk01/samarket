/**
 * Gate 3 — Badge Authority Identity Layer (canonical).
 *
 * Rebuild foundation: member / store / delivery_only scopes.
 * Does not wire UI. Downstream A/B/C must use these keys only.
 *
 * Gate 2:
 *   member:{userId} | store:{storeId} | delivery_only
 *   never merge member A/B with store C
 *   never record store ops under owner user_id as member authority
 */
import {
  memberBadgeIdentity,
  storeBadgeIdentity,
  parseBadgeRecipientIdentityKey,
  memberAndStoreKeysDifferForSameRawId,
  type BadgeIdentityResult,
  type BadgeRecipientIdentity,
  type MemberBadgeIdentity,
  type StoreBadgeIdentity,
} from "@/lib/notifications/badge-authority-rebuild/badge-recipient-identity";

export const BADGE_AUTHORITY_IDENTITY_VERSION = "badge_authority_identity_v1" as const;

export type DeliveryOnlyIdentity = {
  scope: "delivery_only";
  key: "delivery_only";
};

export type BadgeAuthorityRecipient =
  | MemberBadgeIdentity
  | StoreBadgeIdentity
  | DeliveryOnlyIdentity;

export type AuthorityAxis = "A" | "B" | "C_operational" | "C_chat" | "NONE";

export {
  memberBadgeIdentity,
  storeBadgeIdentity,
  parseBadgeRecipientIdentityKey,
  memberAndStoreKeysDifferForSameRawId,
};
export type { BadgeIdentityResult, BadgeRecipientIdentity, MemberBadgeIdentity, StoreBadgeIdentity };

export function deliveryOnlyIdentity(): DeliveryOnlyIdentity {
  return { scope: "delivery_only", key: "delivery_only" };
}

/** Member axes A/B only accept member identity. */
export function assertMemberAxisRecipient(
  identity: BadgeAuthorityRecipient,
  axis: "A" | "B"
): { ok: true } | { ok: false; reason: "MEMBER_AXIS_REQUIRES_MEMBER_SCOPE" } {
  if (identity.scope !== "member") {
    return { ok: false, reason: "MEMBER_AXIS_REQUIRES_MEMBER_SCOPE" };
  }
  void axis;
  return { ok: true };
}

/** Store axes C only accept store identity. */
export function assertStoreAxisRecipient(
  identity: BadgeAuthorityRecipient,
  axis: "C_operational" | "C_chat"
): { ok: true } | { ok: false; reason: "STORE_AXIS_REQUIRES_STORE_SCOPE" } {
  if (identity.scope !== "store") {
    return { ok: false, reason: "STORE_AXIS_REQUIRES_STORE_SCOPE" };
  }
  void axis;
  return { ok: true };
}

/**
 * Forbidden: treat owner user_id as store operational authority recipient.
 * Store ops must use store:{storeId}.
 */
export function forbidOwnerUserIdAsStoreOperationalAuthority(
  recipient: BadgeAuthorityRecipient
): { ok: true } | { ok: false; reason: "OWNER_USER_ID_IS_NOT_STORE_AUTHORITY" } {
  if (recipient.scope === "member") {
    return { ok: false, reason: "OWNER_USER_ID_IS_NOT_STORE_AUTHORITY" };
  }
  if (recipient.scope === "delivery_only") {
    return { ok: false, reason: "OWNER_USER_ID_IS_NOT_STORE_AUTHORITY" };
  }
  return { ok: true };
}

/** App Icon formula components — identity layer documents allowed scopes only. */
export function memberAppIconAllowsAxis(axis: AuthorityAxis): boolean {
  return axis === "A" || axis === "B";
}

export function memberAppIconForbidsAxis(axis: AuthorityAxis): boolean {
  return axis === "C_operational" || axis === "C_chat" || axis === "NONE";
}

/**
 * Same raw UUID under member vs store must remain distinct keys.
 * Multi-store: each storeId is an independent C bucket.
 */
export function storeAuthoritiesAreIsolated(storeIdA: string, storeIdB: string): boolean {
  const a = storeBadgeIdentity(storeIdA);
  const b = storeBadgeIdentity(storeIdB);
  if (!a.ok || !b.ok) return true;
  return a.identity.key !== b.identity.key;
}
