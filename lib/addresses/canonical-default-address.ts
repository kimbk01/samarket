/**
 * Member default-address completeness SSOT.
 *
 * ADDRESS_COMPLETE =
 *   active `user_addresses` row AND `is_default_master === true`
 *
 * NOT complete:
 * - `profiles.region_name` / `region_code` only
 * - `profiles.full_address` + lat/lng (geo fallback)
 * - any active address without master flag
 * - life/trade/delivery default without master
 *
 * Display of neighborhood / trade pin may still use other defaults.
 * Completeness for MyPage + action gates must use this rule only.
 */

export function isCanonicalDefaultMasterPresent(
  defaults: { master?: unknown | null } | null | undefined,
): boolean {
  return defaults != null && defaults.master != null;
}

export function isCanonicalDefaultAddressSnapshotComplete(
  snap:
    | {
        ok?: boolean;
        defaults?: { master?: unknown | null } | null;
      }
    | null
    | undefined,
): boolean {
  return snap?.ok === true && isCanonicalDefaultMasterPresent(snap.defaults);
}
