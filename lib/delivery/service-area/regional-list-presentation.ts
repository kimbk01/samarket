/**
 * Owner/Admin regional LIST presentation helpers.
 * Classification is UX guidance only — not customer eligibility.
 */

import { roundDiscoveryKmInclusive } from "@/lib/delivery/service-area/candidate-discovery";

export type DeliveryRegionalListBand = "base" | "extended" | "outside";

/**
 * Approximate band for list grouping.
 * Uses discovery-inclusive 0.1km floor so R-boundary candidates stay stable.
 */
export function classifyDeliveryRegionalListBand(
  centroidDistanceKm: number | null | undefined,
  referenceRadiusKm: number,
  candidateSearchKm: number
): DeliveryRegionalListBand {
  const r = roundDiscoveryKmInclusive(referenceRadiusKm);
  const s = roundDiscoveryKmInclusive(candidateSearchKm);
  if (centroidDistanceKm == null || !Number.isFinite(centroidDistanceKm)) {
    // Unknown distance: treat as base when store-home path includes it; caller may override.
    return "base";
  }
  const d = roundDiscoveryKmInclusive(centroidDistanceKm);
  if (d <= r) return "base";
  if (d <= s) return "extended";
  return "outside";
}

/** Whole-km guidance label value (UI wraps with i18n "약 {n}km"). */
export function formatApproxDeliveryDistanceKm(
  centroidDistanceKm: number | null | undefined
): number | null {
  if (centroidDistanceKm == null || !Number.isFinite(centroidDistanceKm)) return null;
  if (centroidDistanceKm < 0) return null;
  return Math.round(centroidDistanceKm);
}

/**
 * Initial UI selection for a store that has NEVER confirmed V2 rows.
 * Base-range (≈ ≤ R) candidates default selected. Extended default unselected.
 *
 * Confirmed V2 / saved rows: use saved IDs only (Owner override wins).
 */
export function resolveDeliveryRegionalListSelectedIds(input: {
  authorityMode: string;
  savedSelectedIds: readonly string[];
  candidateRows: ReadonlyArray<{
    geoIdentity: string;
    isStoreHome?: boolean;
    isWithinBaseRange?: boolean;
  }>;
}): { selectedIds: Set<string>; selectionSource: "saved" | "initial_base_default" } {
  const saved = [...input.savedSelectedIds].map((id) => String(id ?? "").trim()).filter(Boolean);
  const confirmed =
    saved.length > 0 || String(input.authorityMode ?? "").toLowerCase() === "v2_lgu";
  if (confirmed) {
    return { selectedIds: new Set(saved), selectionSource: "saved" };
  }
  const proposed = new Set<string>();
  for (const c of input.candidateRows) {
    if (c.isWithinBaseRange || c.isStoreHome) proposed.add(c.geoIdentity);
  }
  return { selectedIds: proposed, selectionSource: "initial_base_default" };
}
