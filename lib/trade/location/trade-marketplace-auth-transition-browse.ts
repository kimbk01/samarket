/**
 * Marketplace browse reseed after auth transitions — in-memory one-shot flags.
 * Not a second location SSOT: hydrate still uses resolveTradeMarketplaceMasterHydrateScope.
 *
 * - Logout / account switch → guest nationwide ALL (strip leaked member CITY URL)
 * - Guest → login → master CITY (or ALL when no master) even if URL still location=all
 *
 * sessionStorage is cleared on wipe, so flags live in module memory until consume.
 */

let guestAllAfterAuthExitPending = false;
let memberBrowseReseedPending = false;

/** Call after session wipe that ends in guest (logout / account switch). */
export function markTradeMarketplaceGuestAllAfterAuthExit(): void {
  guestAllAfterAuthExitPending = true;
  memberBrowseReseedPending = false;
}

/** Call on fresh login completion (guest → member upgrade). */
export function markTradeMarketplaceMemberBrowseReseed(): void {
  memberBrowseReseedPending = true;
  guestAllAfterAuthExitPending = false;
}

export function isTradeMarketplaceGuestAllAfterAuthExitPending(): boolean {
  return guestAllAfterAuthExitPending;
}

export function isTradeMarketplaceMemberBrowseReseedPending(): boolean {
  return memberBrowseReseedPending;
}

/** Consume only after hydrate produced a commitable scope (not unset). */
export function consumeTradeMarketplaceGuestAllAfterAuthExit(): void {
  guestAllAfterAuthExitPending = false;
}

export function consumeTradeMarketplaceMemberBrowseReseed(): void {
  memberBrowseReseedPending = false;
}

/** vitest */
export function resetTradeMarketplaceAuthTransitionBrowseForTests(): void {
  guestAllAfterAuthExitPending = false;
  memberBrowseReseedPending = false;
}
