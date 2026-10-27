/**
 * Default browse location tiers — LOCAL → NEARBY → NATIONWIDE (Owner SSOT 2026-10-16).
 *
 * Applies only to anchor City + distance 「전체」 (`radiusKm == null`). Ranking only:
 * every eligible listing stays in the result; tiers decide order.
 *
 * - local    : anchor City (trade_lgu_id = anchor, or legacy region/city mapped to anchor)
 * - nearby   : LGUs whose centroid is within `TRADE_BROWSE_NEARBY_TIER_RADIUS_KM` of the
 *              anchor centroid, anchor excluded (same radius matcher as explicit `radius=`)
 * - outside  : everything else, including listings with no resolvable location
 *
 * The three tiers are disjoint and their union is the full eligible set — SQL filters
 * (`tierLocationQueryExtras`) and the in-memory classifier (`classifyListingBrowseTier`)
 * use the same canonical id + legacy member sets.
 *
 * Server-side only (loads LGU dataset + centroids).
 */
import {
  legacyMembersForCanonicalIds,
  listingMatchesTradeFeedLocation,
  resolveTradeFeedLocationConstraint,
  type TradeFeedLegacyRegionMembers,
  type TradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { tradeFeedLocationToQueryExtras } from "@/lib/trade/location/national/trade-feed-location-query-extras";
import { TRADE_BROWSE_NEARBY_TIER_RADIUS_KM } from "@/lib/trade/location/trade-browse-radius";
import type { TradeFeedQueryExtras } from "@/lib/posts/trade-posts-range-query";

type LguConstraint = Extract<TradeFeedLocationConstraint, { kind: "lgu" }>;

export type BrowseLocationTier = "local" | "nearby" | "outside";

export const BROWSE_LOCATION_TIER_ORDER: readonly BrowseLocationTier[] = [
  "local",
  "nearby",
  "outside",
];

export type BrowseLocationTiers = {
  anchorCanonicalId: string;
  /** Anchor City only (radius null). */
  local: LguConstraint;
  /** Nearby ring without the anchor — null when no other LGU is in range. */
  nearby: LguConstraint | null;
  /** local ∪ nearby — complement is the outside tier. */
  near: LguConstraint;
  nearbyRadiusKm: number;
};

function subtractLegacyMembers(
  members: TradeFeedLegacyRegionMembers[],
  remove: TradeFeedLegacyRegionMembers[]
): TradeFeedLegacyRegionMembers[] {
  const removeKeys = new Set<string>();
  for (const m of remove) for (const c of m.cityIds) removeKeys.add(`${m.regionId}\u0000${c}`);
  const out: TradeFeedLegacyRegionMembers[] = [];
  for (const m of members) {
    const cityIds = m.cityIds.filter((c) => !removeKeys.has(`${m.regionId}\u0000${c}`));
    if (cityIds.length > 0) out.push({ regionId: m.regionId, cityIds });
  }
  return out;
}

/**
 * Tiers for a default browse anchor. Returns null when the constraint is not an
 * anchor + 「전체」 browse (ALL / invalid / explicit radius).
 */
export function resolveBrowseLocationTiers(
  constraint: TradeFeedLocationConstraint
): BrowseLocationTiers | null {
  if (constraint.kind !== "lgu" || constraint.radiusKm != null) return null;
  const anchorCanonicalId = constraint.canonicalId;
  const local: LguConstraint = {
    kind: "lgu",
    canonicalId: anchorCanonicalId,
    radiusKm: null,
    matchingCanonicalIds: [anchorCanonicalId],
    legacyMembers: legacyMembersForCanonicalIds([anchorCanonicalId]),
  };

  const radius = resolveTradeFeedLocationConstraint(
    anchorCanonicalId,
    TRADE_BROWSE_NEARBY_TIER_RADIUS_KM
  );
  const ringIds =
    radius.kind === "lgu"
      ? [...new Set(radius.matchingCanonicalIds)].filter((id) => id !== anchorCanonicalId).sort()
      : [];

  const nearby: LguConstraint | null =
    ringIds.length > 0
      ? {
          kind: "lgu",
          canonicalId: anchorCanonicalId,
          radiusKm: null,
          matchingCanonicalIds: ringIds,
          legacyMembers: subtractLegacyMembers(
            legacyMembersForCanonicalIds(ringIds),
            local.legacyMembers
          ),
        }
      : null;

  const nearIds = [anchorCanonicalId, ...ringIds].sort();
  const near: LguConstraint = {
    kind: "lgu",
    canonicalId: anchorCanonicalId,
    radiusKm: null,
    matchingCanonicalIds: nearIds,
    legacyMembers: legacyMembersForCanonicalIds(nearIds),
  };

  return {
    anchorCanonicalId,
    local,
    nearby,
    near,
    nearbyRadiusKm: TRADE_BROWSE_NEARBY_TIER_RADIUS_KM,
  };
}

/**
 * 2026-10-27 Owner 목록 계약(`docs/dibay-marketplace-list-ssot-target.md`): 거리를 지정해도 목록에는 **전체**가 나온다 — 거리는 순서만 정한다.
 * explicit `radius=N` → LOCAL = 반경 N 안(지정 지역) → NEARBY = 추천 반경(64km) 안 나머지 → 그 밖 전체.
 * N ≥ 추천 반경이면 NEARBY 없음. 세 구간은 기본 tier 와 같은 방식(겹치지 않음, 합 = 전체)이다.
 */
export function resolveBrowseLocationTiersForRadius(
  constraint: TradeFeedLocationConstraint
): BrowseLocationTiers | null {
  if (constraint.kind !== "lgu" || constraint.radiusKm == null) return null;
  const anchorCanonicalId = constraint.canonicalId;
  const insideIds = [...new Set(constraint.matchingCanonicalIds)].sort();
  if (insideIds.length === 0) return null;
  const local: LguConstraint = {
    kind: "lgu",
    canonicalId: anchorCanonicalId,
    radiusKm: null,
    matchingCanonicalIds: insideIds,
    legacyMembers: legacyMembersForCanonicalIds(insideIds),
  };
  const insideSet = new Set(insideIds);
  const ringConstraint =
    constraint.radiusKm < TRADE_BROWSE_NEARBY_TIER_RADIUS_KM
      ? resolveTradeFeedLocationConstraint(anchorCanonicalId, TRADE_BROWSE_NEARBY_TIER_RADIUS_KM)
      : null;
  const ringIds =
    ringConstraint && ringConstraint.kind === "lgu"
      ? [...new Set(ringConstraint.matchingCanonicalIds)].filter((id) => !insideSet.has(id)).sort()
      : [];
  const nearby: LguConstraint | null =
    ringIds.length > 0
      ? {
          kind: "lgu",
          canonicalId: anchorCanonicalId,
          radiusKm: null,
          matchingCanonicalIds: ringIds,
          legacyMembers: subtractLegacyMembers(legacyMembersForCanonicalIds(ringIds), local.legacyMembers),
        }
      : null;
  const nearIds = [...insideIds, ...ringIds].sort();
  const near: LguConstraint = {
    kind: "lgu",
    canonicalId: anchorCanonicalId,
    radiusKm: null,
    matchingCanonicalIds: nearIds,
    legacyMembers: legacyMembersForCanonicalIds(nearIds),
  };
  return {
    anchorCanonicalId,
    local,
    nearby,
    near,
    nearbyRadiusKm: TRADE_BROWSE_NEARBY_TIER_RADIUS_KM,
  };
}

/** 기본(반경 없음)·반경 지정 모두 — 순서만 정하는 지역 구간. 지역 없음(ALL)·잘못된 값은 null. */
export function resolveBrowseLocationTiersSoft(
  constraint: TradeFeedLocationConstraint
): BrowseLocationTiers | null {
  return resolveBrowseLocationTiers(constraint) ?? resolveBrowseLocationTiersForRadius(constraint);
}

type TierListing = {
  trade_lgu_id?: string | null;
  region?: string | null;
  city?: string | null;
};

export function classifyListingBrowseTier(
  listing: TierListing,
  tiers: BrowseLocationTiers
): BrowseLocationTier {
  const loc = { trade_lgu_id: listing.trade_lgu_id, region: listing.region, city: listing.city };
  if (listingMatchesTradeFeedLocation(loc, tiers.local)) return "local";
  if (tiers.nearby && listingMatchesTradeFeedLocation(loc, tiers.nearby)) return "nearby";
  return "outside";
}

export function partitionListingsByBrowseTier<T extends TierListing>(
  rows: T[],
  tiers: BrowseLocationTiers
): Record<BrowseLocationTier, T[]> {
  const out: Record<BrowseLocationTier, T[]> = { local: [], nearby: [], outside: [] };
  for (const row of rows) out[classifyListingBrowseTier(row, tiers)].push(row);
  return out;
}

/**
 * PostgREST `.or()` body matching rows OUTSIDE `constraint` — exact complement of
 * `buildTradeFeedLocationOrFilter` / `listingMatchesTradeFeedLocation`, NULL-safe:
 * - trade_lgu_id set → outside when not in matching ids
 * - trade_lgu_id null → outside unless (region, city) is a legacy member
 *   (null/empty region or city never matches a member → outside)
 */
export function buildTradeFeedLocationExcludeOrFilter(constraint: LguConstraint): string {
  const ids = [...new Set(constraint.matchingCanonicalIds)].sort();
  const withLgu =
    ids.length === 0
      ? "trade_lgu_id.not.is.null"
      : `and(trade_lgu_id.not.is.null,trade_lgu_id.not.in.(${ids.join(",")}))`;
  if (constraint.legacyMembers.length === 0) {
    return `${withLgu},trade_lgu_id.is.null`;
  }
  const legacyMisses = constraint.legacyMembers.map(
    (m) =>
      `or(region.is.null,city.is.null,region.neq.${m.regionId},city.not.in.(${m.cityIds.join(",")}))`
  );
  return `${withLgu},and(trade_lgu_id.is.null,${legacyMisses.join(",")})`;
}

/** SQL location filter selecting exactly one tier. Null → tier is empty (skip query). */
export function tierLocationQueryExtras(
  tiers: BrowseLocationTiers,
  tier: BrowseLocationTier
): NonNullable<TradeFeedQueryExtras["tradeFeedLocation"]> | null {
  if (tier === "local") return tradeFeedLocationToQueryExtras(tiers.local) ?? null;
  if (tier === "nearby") {
    return tiers.nearby ? tradeFeedLocationToQueryExtras(tiers.nearby) ?? null : null;
  }
  return { type: "or", orBody: buildTradeFeedLocationExcludeOrFilter(tiers.near) };
}
