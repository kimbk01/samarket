/**
 * P1-C1 — First customer-listed authority (contract + write intent).
 *
 * DB FINAL AUTHORITY: `stores_protect_first_listed_at` trigger stamps
 * `first_listed_at` on first `is_visible` false→true and keeps it immutable.
 *
 * App helpers must NOT invent a competing timestamp. Writers send visibility
 * intent only; the DB trigger is the sole stamp clock.
 *
 * NOT created_at / approved_at / updated_at.
 * Window days / HOME shelf / browse sort=new are OUT (P1-C2+).
 */

export const STORE_FIRST_LISTED_AT_COLUMN = "first_listed_at" as const;

export type StoreVisibilityStampContractInput = {
  wasVisible: boolean;
  nextVisible: boolean;
  /** Existing DB value — null/empty means never listed */
  existingFirstListedAt: string | null | undefined;
};

/**
 * App write intent — visibility only.
 * Do not attach `first_listed_at` here (avoids App clock vs DB `now()` dual authority).
 */
export function buildStoreVisibilityWritePatch(nextVisible: boolean): {
  is_visible: boolean;
} {
  return { is_visible: nextVisible };
}

/**
 * Contract mirror of the DB trigger stamp rule (not a write clock).
 * Returns true when the DB trigger will stamp on this transition.
 */
export function wouldDbStampFirstListedAt(
  input: StoreVisibilityStampContractInput
): boolean {
  const existing = normalizeExistingFirstListedAt(input.existingFirstListedAt);
  if (existing != null) return false;
  return !input.wasVisible && input.nextVisible;
}

/** @deprecated Use buildStoreVisibilityWritePatch for writers. */
export function buildStoreVisibilityUpdatePatch(input: {
  wasVisible: boolean;
  nextVisible: boolean;
  existingFirstListedAt?: string | null | undefined;
  nowIso?: string;
}): { is_visible: boolean } {
  void input.wasVisible;
  void input.existingFirstListedAt;
  void input.nowIso;
  return buildStoreVisibilityWritePatch(input.nextVisible);
}

function normalizeExistingFirstListedAt(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t.length > 0 ? t : null;
}

/** Approval / create must not invent a listing stamp. */
export function approvalOrCreateMustNotStampFirstListedAt(): true {
  return true;
}
