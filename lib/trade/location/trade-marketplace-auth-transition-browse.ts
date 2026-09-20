/**
 * Marketplace browse reseed after auth transitions.
 * Not a second location SSOT: hydrate still uses resolveTradeMarketplaceMasterHydrateScope.
 *
 * - Logout / account switch → guest nationwide ALL (strip leaked member CITY URL)
 * - Guest → login → master CITY (or ALL when no master) even if URL still location=all
 *
 * Guest-all must survive logout hard `location.replace("/login")` + history Back to
 * `/market?location=city…`. sessionStorage is cleared during wipe — mark MUST run after wipe clear.
 *
 * Member-reseed stays in-memory (SPA login completion keeps JS context) and clears guest-all
 * so Account B master never loses to a leftover A logout marker.
 */

/** Intent only — no CITY/LGU/radius/address payload. */
export const TRADE_MARKETPLACE_GUEST_ALL_AFTER_AUTH_EXIT_KEY =
  "samarket:trade-marketplace-guest-all-after-auth-exit:v1";

let guestAllAfterAuthExitMemory = false;
let memberBrowseReseedPending = false;

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

function readDurableGuestAllPending(): boolean {
  if (!canUseSessionStorage()) return false;
  try {
    return sessionStorage.getItem(TRADE_MARKETPLACE_GUEST_ALL_AFTER_AUTH_EXIT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDurableGuestAllPending(pending: boolean): void {
  if (!canUseSessionStorage()) return;
  try {
    if (pending) {
      sessionStorage.setItem(TRADE_MARKETPLACE_GUEST_ALL_AFTER_AUTH_EXIT_KEY, "1");
    } else {
      sessionStorage.removeItem(TRADE_MARKETPLACE_GUEST_ALL_AFTER_AUTH_EXIT_KEY);
    }
  } catch {
    /* private mode · quota */
  }
}

/** Call after session wipe that ends in guest (logout / account switch). After sessionStorage.clear. */
export function markTradeMarketplaceGuestAllAfterAuthExit(): void {
  guestAllAfterAuthExitMemory = true;
  memberBrowseReseedPending = false;
  writeDurableGuestAllPending(true);
}

/** Call on fresh login completion (guest → member upgrade). Clears durable guest-exit intent. */
export function markTradeMarketplaceMemberBrowseReseed(): void {
  memberBrowseReseedPending = true;
  guestAllAfterAuthExitMemory = false;
  writeDurableGuestAllPending(false);
}

export function isTradeMarketplaceGuestAllAfterAuthExitPending(): boolean {
  return guestAllAfterAuthExitMemory || readDurableGuestAllPending();
}

export function isTradeMarketplaceMemberBrowseReseedPending(): boolean {
  return memberBrowseReseedPending;
}

/**
 * Consume only after Marketplace hydrate committed auth-exit ALL
 * (not on /login load, not on UNSET/recoverable).
 */
export function consumeTradeMarketplaceGuestAllAfterAuthExit(): void {
  guestAllAfterAuthExitMemory = false;
  writeDurableGuestAllPending(false);
}

export function consumeTradeMarketplaceMemberBrowseReseed(): void {
  memberBrowseReseedPending = false;
}

/** Guest auth-exit target is ALL only — never permanent guest=ALL enforcement. */
export function shouldConsumeTradeMarketplaceGuestAllAfterAuthExit(
  next: { mode: string }
): boolean {
  return next.mode === "all";
}

/** vitest — clear memory + durable key */
export function resetTradeMarketplaceAuthTransitionBrowseForTests(): void {
  guestAllAfterAuthExitMemory = false;
  memberBrowseReseedPending = false;
  writeDurableGuestAllPending(false);
}

/**
 * vitest — hard navigation destroys module memory; durable session key remains.
 */
export function simulateTradeMarketplaceAuthTransitionHardNavForTests(): void {
  guestAllAfterAuthExitMemory = false;
  memberBrowseReseedPending = false;
}
