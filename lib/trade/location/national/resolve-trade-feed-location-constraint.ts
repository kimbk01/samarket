/**
 * Trade feed CITY/LGU discovery filter — shared Home + Category authority.
 *
 * NEW: trade_lgu_id = canonical
 * LEGACY: trade_lgu_id IS NULL AND region/city ∈ local members of canonical
 *
 * Server-side only (loads local-area map). Do not import from client bundles.
 */

import {
  isTradeNationalPsgcCanonicalId,
  resolveTradeLguUrlTokenToCanonical,
} from "@/lib/trade/location/national/legacy-product-alias-canonical";
import {
  getTradeNationalLguById,
  loadTradeNationalLguDataset,
} from "@/lib/trade/location/national/load-national-lgu-dataset";

export type TradeFeedLegacyRegionMembers = {
  regionId: string;
  cityIds: string[];
};

export type TradeFeedLocationConstraint =
  | { kind: "all" }
  | { kind: "invalid"; raw: string }
  | {
      kind: "lgu";
      canonicalId: string;
      legacyMembers: TradeFeedLegacyRegionMembers[];
    };

export function resolveTradeFeedLocationConstraint(
  rawLguToken: string | null | undefined
): TradeFeedLocationConstraint {
  const raw = (rawLguToken ?? "").trim();
  if (!raw) return { kind: "all" };

  const canonicalId = resolveTradeLguUrlTokenToCanonical(raw);
  if (!canonicalId) return { kind: "invalid", raw };

  const lgu = getTradeNationalLguById(canonicalId);
  if (!lgu?.isActive) return { kind: "invalid", raw };

  // PSGC token that is not City/Municipality selectable (shouldn't happen for 10-digit city codes)
  if (!isTradeNationalPsgcCanonicalId(canonicalId)) return { kind: "invalid", raw };

  const members = loadTradeNationalLguDataset().localAreaMap.filter(
    (r) => r.canonicalId === canonicalId
  );
  const byRegion = new Map<string, string[]>();
  for (const m of members) {
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

  return { kind: "lgu", canonicalId, legacyMembers };
}

/**
 * PostgREST `.or(...)` body (no `or=` prefix).
 * Single branch when no legacy members (nationwide LGU with empty local taxonomy).
 */
export function buildTradeFeedLocationOrFilter(
  constraint: Extract<TradeFeedLocationConstraint, { kind: "lgu" }>
): string {
  const national = `trade_lgu_id.eq.${constraint.canonicalId}`;
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
    or: (filters: string) => unknown;
  },
  constraint: TradeFeedLocationConstraint
): unknown {
  if (constraint.kind !== "lgu") return q;
  const orBody = buildTradeFeedLocationOrFilter(constraint);
  if (constraint.legacyMembers.length === 0) {
    return q.eq("trade_lgu_id", constraint.canonicalId);
  }
  return q.or(orBody);
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
    return tid === constraint.canonicalId;
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
  return `loc:lgu:${constraint.canonicalId}`;
}
