/**
 * Address structured fields → National PSGC LGU.
 *
 * LOCAL AREA resolver (`mapUserAddressToAppLocation`) is separate.
 * Authority: explicit aliases + structured city/municipality (+ province) match.
 * Forbidden: formatted_address regex / display_line substring / silent first-match.
 */

import {
  expandTradeNationalLguNameVariants,
  normalizeTradeNationalLguName,
} from "@/lib/trade/location/national/normalize-lgu-name";
import {
  getTradeNationalLguById,
  loadTradeNationalLguDataset,
} from "@/lib/trade/location/national/load-national-lgu-dataset";
import type {
  NationalLguCandidate,
  NationalLguResolution,
  TradeNationalLgu,
} from "@/lib/trade/location/national/types";

export type ResolveTradeNationalLguInput = {
  cityMunicipality?: string | null;
  province?: string | null;
  /** Optional Google admin_area_level_1 (often province / NCR) */
  adminAreaLevel1?: string | null;
  /** Optional Google locality / admin_area_level_2 */
  locality?: string | null;
  /** place_id / lat-lng reserved for future disambiguation — ignored in N1 */
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
};

function toCandidate(lgu: TradeNationalLgu): NationalLguCandidate {
  return {
    canonicalId: lgu.canonicalId,
    displayName: lgu.displayName,
    regionName: lgu.regionName,
    provinceName: lgu.provinceName,
    lguType: lgu.lguType,
  };
}

function uniqueByCanonical(lgus: TradeNationalLgu[]): TradeNationalLgu[] {
  const map = new Map<string, TradeNationalLgu>();
  for (const l of lgus) map.set(l.canonicalId, l);
  return [...map.values()];
}

function provinceNorm(raw: string | null | undefined): string {
  return normalizeTradeNationalLguName(raw);
}

function provinceMatches(lgu: TradeNationalLgu, provNorm: string): boolean {
  if (!provNorm) return true;
  const pn = provinceNorm(lgu.provinceName);
  if (pn && (pn === provNorm || pn.includes(provNorm) || provNorm.includes(pn))) {
    return true;
  }
  // NCR / Metro Manila / National Capital Region
  const rn = provinceNorm(lgu.regionName);
  if (
    lgu.regionCode === "13" &&
    (provNorm.includes("ncr") ||
      provNorm.includes("metro manila") ||
      provNorm.includes("national capital") ||
      rn.includes(provNorm))
  ) {
    return true;
  }
  // HUC: province often empty; provider may send city name as province or region name
  if (!lgu.provinceName) {
    const dn = normalizeTradeNationalLguName(lgu.displayName);
    if (dn === provNorm || dn.includes(provNorm) || expandTradeNationalLguNameVariants(lgu.displayName).includes(provNorm)) {
      return true;
    }
    if (rn && (rn === provNorm || rn.includes(provNorm) || provNorm.includes(rn))) {
      return true;
    }
  }
  return false;
}

function resolveFromAliasKinds(
  variants: string[],
  kinds: Array<"legacy_product" | "provider_display">
): TradeNationalLgu[] {
  const { aliasIndex } = loadTradeNationalLguDataset();
  const hits: TradeNationalLgu[] = [];
  for (const v of variants) {
    for (const a of aliasIndex.get(v) ?? []) {
      if (!kinds.includes(a.kind as "legacy_product" | "provider_display")) continue;
      const lgu = getTradeNationalLguById(a.canonicalId);
      if (lgu?.isActive) hits.push(lgu);
    }
  }
  return uniqueByCanonical(hits);
}

function resolveFromDisplayNames(variants: string[]): TradeNationalLgu[] {
  const { aliasIndex } = loadTradeNationalLguDataset();
  const hits: TradeNationalLgu[] = [];
  for (const v of variants) {
    for (const a of aliasIndex.get(v) ?? []) {
      if (a.kind !== "display_name" && a.kind !== "old_name") continue;
      const lgu = getTradeNationalLguById(a.canonicalId);
      if (lgu?.isActive) hits.push(lgu);
    }
  }
  return uniqueByCanonical(hits);
}

function finish(hits: TradeNationalLgu[]): NationalLguResolution {
  if (hits.length === 1) {
    const lgu = hits[0]!;
    return { status: "resolved", canonicalId: lgu.canonicalId, lgu };
  }
  if (hits.length > 1) {
    return {
      status: "ambiguous",
      candidates: hits.map(toCandidate).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    };
  }
  return { status: "unresolved" };
}

/**
 * Resolve structured address fields to a national LGU.
 * Does not read `formattedAddress` / free-form lines.
 */
export function resolveTradeNationalLgu(
  input: ResolveTradeNationalLguInput
): NationalLguResolution {
  const cityRaw =
    (input.cityMunicipality ?? "").trim() ||
    (input.locality ?? "").trim() ||
    "";
  if (!cityRaw) return { status: "unresolved" };

  const variants = expandTradeNationalLguNameVariants(cityRaw);
  const provRaw =
    (input.province ?? "").trim() ||
    (input.adminAreaLevel1 ?? "").trim() ||
    "";
  const prov = provinceNorm(provRaw);

  // 1) Explicit product/provider aliases (deterministic unique mapping)
  let aliasHits = resolveFromAliasKinds(variants, ["legacy_product", "provider_display"]);
  if (prov) {
    const filtered = aliasHits.filter((l) => provinceMatches(l, prov));
    if (filtered.length > 0) aliasHits = filtered;
  }
  if (aliasHits.length === 1) return finish(aliasHits);
  if (aliasHits.length > 1) return finish(aliasHits);

  // 2) Structured display_name / old_name match
  let nameHits = resolveFromDisplayNames(variants);
  if (prov) {
    const filtered = nameHits.filter((l) => provinceMatches(l, prov));
    if (filtered.length === 0) return { status: "unresolved" };
    nameHits = filtered;
  }

  return finish(nameHits);
}
