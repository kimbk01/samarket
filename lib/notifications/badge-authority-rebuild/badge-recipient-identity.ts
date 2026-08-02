/**
 * Slice 2-1 — Recipient identity foundation.
 * Raw UUID is never a badge identity.
 */

export type MemberBadgeIdentity = {
  scope: "member";
  key: `user:${string}`;
  userId: string;
};

export type StoreBadgeIdentity = {
  scope: "store";
  key: `store:${string}`;
  storeId: string;
};

export type BadgeRecipientIdentity = MemberBadgeIdentity | StoreBadgeIdentity;

export type BadgeIdentityFailureReason =
  | "RAW_UUID_IS_NOT_A_BADGE_IDENTITY"
  | "EMPTY_USER_ID"
  | "EMPTY_STORE_ID"
  | "INVALID_MEMBER_KEY"
  | "INVALID_STORE_KEY"
  | "SCOPE_KEY_MISMATCH";

export type BadgeIdentityResult =
  | { ok: true; identity: BadgeRecipientIdentity }
  | { ok: false; reason: BadgeIdentityFailureReason };

function trimId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Reject bare UUID / opaque id without scope prefix. */
export function isRawUuidLike(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("user:") || v.startsWith("store:")) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export function memberBadgeIdentity(userId: string): BadgeIdentityResult {
  const id = trimId(userId);
  if (!id) return { ok: false, reason: "EMPTY_USER_ID" };
  if (id.startsWith("store:")) return { ok: false, reason: "INVALID_MEMBER_KEY" };
  if (id.startsWith("user:")) {
    const raw = id.slice("user:".length).trim();
    if (!raw) return { ok: false, reason: "EMPTY_USER_ID" };
    return { ok: true, identity: { scope: "member", key: `user:${raw}`, userId: raw } };
  }
  return { ok: true, identity: { scope: "member", key: `user:${id}`, userId: id } };
}

export function storeBadgeIdentity(storeId: string): BadgeIdentityResult {
  const id = trimId(storeId);
  if (!id) return { ok: false, reason: "EMPTY_STORE_ID" };
  if (id.startsWith("user:")) return { ok: false, reason: "INVALID_STORE_KEY" };
  if (id.startsWith("store:")) {
    const raw = id.slice("store:".length).trim();
    if (!raw) return { ok: false, reason: "EMPTY_STORE_ID" };
    return { ok: true, identity: { scope: "store", key: `store:${raw}`, storeId: raw } };
  }
  return { ok: true, identity: { scope: "store", key: `store:${id}`, storeId: id } };
}

/**
 * Parse only scoped keys. Raw UUID → failure (never invent scope).
 */
export function parseBadgeRecipientIdentityKey(key: string): BadgeIdentityResult {
  const k = trimId(key);
  if (!k) return { ok: false, reason: "RAW_UUID_IS_NOT_A_BADGE_IDENTITY" };
  if (isRawUuidLike(k)) return { ok: false, reason: "RAW_UUID_IS_NOT_A_BADGE_IDENTITY" };
  if (k.startsWith("user:")) return memberBadgeIdentity(k);
  if (k.startsWith("store:")) return storeBadgeIdentity(k);
  return { ok: false, reason: "RAW_UUID_IS_NOT_A_BADGE_IDENTITY" };
}

export function identitiesAreDistinctScopes(
  a: BadgeRecipientIdentity,
  b: BadgeRecipientIdentity
): boolean {
  return a.scope !== b.scope || a.key !== b.key;
}

/** Same raw id string under different scopes must remain distinct. */
export function memberAndStoreKeysDifferForSameRawId(rawId: string): boolean {
  const m = memberBadgeIdentity(rawId);
  const s = storeBadgeIdentity(rawId);
  if (!m.ok || !s.ok) return true;
  return m.identity.key !== s.identity.key;
}
