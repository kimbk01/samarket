/**
 * Trade feed CITY/LGU discovery filter — shared Home + Category authority.
 *
 * NEW: trade_lgu_id = canonical (single or radius-matched set)
 * LEGACY: trade_lgu_id IS NULL AND region/city ∈ local members of matching canonicals
 *
 * Server-side only (loads local-area map + centroids). Do not import from client bundles.
 */

import {
  isTradeNationalPsgcCanonicalId,
  resolveTradeLguUrlTokenToCanonical,
} from "@/lib/trade/location/national/legacy-product-alias-canonical";
import {
  getTradeNationalLguById,
  loadTradeNationalLguDataset,
} from "@/lib/trade/location/national/load-national-lgu-dataset";
import {
  matchTradeLguIdsInRadius,
  resolveTradeBrowseCenterForCanonical,
} from "@/lib/trade/location/national/lgu-centroids";
import {
  sanitizeTradeBrowseRadiusKm,
  tradeBrowseRadiusCacheSegment,
} from "@/lib/trade/location/trade-browse-radius";

export type TradeFeedLegacyRegionMembers = {
  regionId: string;
  cityIds: string[];
};

export type TradeFeedLocationConstraint =
  | { kind: "all" }
  | { kind: "invalid"; raw: string }
  | {
      kind: "lgu";
      /** Browse anchor City */
      canonicalId: string;
      radiusKm: number | null;
      /** City-grain radius match set (includes anchor) */
      matchingCanonicalIds: string[];
      legacyMembers: TradeFeedLegacyRegionMembers[];
    };

function legacyMembersForCanonicalIds(
  canonicalIds: string[]
): TradeFeedLegacyRegionMembers[] {
  const idSet = new Set(canonicalIds);
  const byRegion = new Map<string, string[]>();
  for (const m of loadTradeNationalLguDataset().localAreaMap) {
    if (!idSet.has(m.canonicalId)) continue;
    const list = byRegion.get(m.regionId) ?? [];
    list.push(m.cityId);
    byRegion.set(m.regionId, list);
  }
  const legacyMembers: TradeFeedLegacyRegionMembers[] = [...byRegion.entries()].map(
    ([regionId, cityIds]) => ({
      regionId,
      cityIds: [...new Set(cityIds)].sort(),
    })
  );
  legacyMembers.sort((a, b) => a.regionId.localeCompare(b.regionId));
  return legacyMembers;
}

export function resolveTradeFeedLocationConstraint(
  rawLguToken: string | null | undefined,
  radiusKm?: number | null
): TradeFeedLocationConstraint {
  const raw = (rawLguToken ?? "").trim();
  if (!raw) return { kind: "all" };

  const canonicalId = resolveTradeLguUrlTokenToCanonical(raw);
  if (!canonicalId) return { kind: "invalid", raw };

  const lgu = getTradeNationalLguById(canonicalId);
  if (!lgu?.isActive) return { kind: "invalid", raw };

  if (!isTradeNationalPsgcCanonicalId(canonicalId)) return { kind: "invalid", raw };

  const radius =
    radiusKm == null ? null : sanitizeTradeBrowseRadiusKm(radiusKm);

  const center = resolveTradeBrowseCenterForCanonical(canonicalId);
  const matchingCanonicalIds =
    radius == null || !center
      ? [canonicalId]
      : matchTradeLguIdsInRadius({
          centerLat: center.lat,
          centerLng: center.lng,
          radiusKm: radius,
          centerCanonicalId: canonicalId,
        });

  const legacyMembers = legacyMembersForCanonicalIds(matchingCanonicalIds);

  return {
    kind: "lgu",
    canonicalId,
    radiusKm: radius,
    matchingCanonicalIds,
    legacyMembers,
  };
}

/**
 * PostgREST `.or(...)` body (no `or=` prefix).
 * Radius: trade_lgu_id IN matching set (+ optional null-gated legacy).
 */
export function buildTradeFeedLocationOrFilter(
  constraint: Extract<TradeFeedLocationConstraint, { kind: "lgu" }>
): string {
  const ids = [...new Set(constraint.matchingCanonicalIds)].sort();
  const national =
    ids.length <= 1
      ? `trade_lgu_id.eq.${ids[0] ?? constraint.canonicalId}`
      : `trade_lgu_id.in.(${ids.join(",")})`;
  if (constraint.legacyMembers.length === 0) {
    return national;
  }
  const legacyParts = constraint.legacyMembers.map((m) => {
    const cities = m.cityIds.join(",");
    return `and(trade_lgu_id.is.null,region.eq.${m.regionId},city.in.(${cities}))`;
  });
  return [national, ...legacyParts].join(",");
}

export function applyTradeFeedLocationConstraintToQuery(
  q: {
    eq: (c: string, v: string) => unknown;
    in: (c: string, v: string[]) => unknown;
    or: (filters: string) => unknown;
  },
  constraint: TradeFeedLocationConstraint
): unknown {
  if (constraint.kind !== "lgu") return q;
  const ids = [...new Set(constraint.matchingCanonicalIds)].sort();
  if (constraint.legacyMembers.length === 0) {
    if (ids.length <= 1) {
      return q.eq("trade_lgu_id", ids[0] ?? constraint.canonicalId);
    }
    return q.in("trade_lgu_id", ids);
  }
  return q.or(buildTradeFeedLocationOrFilter(constraint));
}

/** Pure match — unit tests / conflict proof (same equation as SQL). */
export function listingMatchesTradeFeedLocation(
  listing: {
    trade_lgu_id?: string | null;
    region?: string | null;
    city?: string | null;
  },
  constraint: Extract<TradeFeedLocationConstraint, { kind: "lgu" }>
): boolean {
  const tid = (listing.trade_lgu_id ?? "").trim();
  if (tid) {
    return constraint.matchingCanonicalIds.includes(tid);
  }
  const region = (listing.region ?? "").trim();
  const city = (listing.city ?? "").trim();
  if (!region || !city) return false;
  return constraint.legacyMembers.some(
    (m) => m.regionId === region && m.cityIds.includes(city)
  );
}

export function tradeFeedLocationCacheSegment(
  constraint: TradeFeedLocationConstraint
): string {
  if (constraint.kind === "all") return "loc:all";
  if (constraint.kind === "invalid") return `loc:invalid:${constraint.raw}`;
  return `loc:lgu:${constraint.canonicalId}:${tradeBrowseRadiusCacheSegment(constraint.radiusKm)}`;
}
