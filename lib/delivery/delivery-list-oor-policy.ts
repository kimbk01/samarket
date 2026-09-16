/**
 * Member-list OOR policy (post–CUT1 forensic close).
 *
 * - Authenticated + canonical master address (`saved_address`):
 *   OOR badge + normal-list EXCLUDE.
 * - Guest / GPS (`explicit_coords`) / no origin:
 *   distance may sort/display, but MUST NOT become delivery eligibility
 *   (no OOR badge, no exclude).
 */

export type DeliveryListOriginSource = "saved_address" | "explicit_coords" | "none";

/** Primary customer-facing OOR state — not "{km}km 초과". */
export const DELIVERY_OOR_PRIMARY_COPY_KO = "배달 가능 지역 아님";
export const DELIVERY_OOR_PRIMARY_COPY_EN = "Outside delivery area";

export function memberDeliveryServiceabilityActive(
  originSource: DeliveryListOriginSource | null | undefined
): boolean {
  return originSource === "saved_address";
}

/**
 * List/home/search OOR flag for customer UI.
 * Guest GPS distance never flips this to true.
 */
export function resolveListDistanceOutOfRange(args: {
  originSource: DeliveryListOriginSource | null | undefined;
  serviceabilityApplies: boolean;
  reason: string | null | undefined;
}): boolean {
  if (!memberDeliveryServiceabilityActive(args.originSource)) return false;
  if (!args.serviceabilityApplies) return false;
  return args.reason === "out_of_range" || args.reason === "missing_store_coords";
}

/** Normal orderable lists: EXCLUDE member OOR stores (not deprioritize). */
export function shouldExcludeOutOfRangeFromNormalList(args: {
  originSource: DeliveryListOriginSource | null | undefined;
  distanceOutOfRange: boolean;
}): boolean {
  return memberDeliveryServiceabilityActive(args.originSource) && args.distanceOutOfRange === true;
}

/** HOME shelves that may intentionally keep OOR with primary OOR copy. */
export const HOME_DISCOVERY_SHELVES_ALLOW_OOR = ["campaignFood", "slot5Food"] as const;
