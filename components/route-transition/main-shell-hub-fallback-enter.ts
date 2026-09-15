/**
 * MAIN shell hub-fallback enter eligibility.
 *
 * `hubChromeHeader` means Header+Body share ONE push surface — dual-panel would
 * slide body only. That chrome presence is NOT the same as "may run fallback enter".
 *
 * Cart/checkout intentionally drops hub chrome (`mainShellChildScrollLocked`) but
 * still owns the single push surface; forward enter must keep hub-fallback
 * (RIGHT→LEFT) instead of remounting via dual-panel push track.
 */
export function shouldUseMainShellHubFallbackEnter(opts: {
  hubChromeHeaderPresent: boolean;
  /** `/stores/:slug/cart|checkout` — viewport-locked child scroll on push surface */
  mainShellChildScrollLocked: boolean;
}): boolean {
  return opts.hubChromeHeaderPresent || opts.mainShellChildScrollLocked;
}
