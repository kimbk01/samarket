/**
 * Buyer Marketplace browse location — separate from seller listing City,
 * member master address, and meet spot.
 *
 * URL commit still uses TradeLocationScope (`?location=city&lgu=…`).
 * Draft lives only in the location sheet until Apply / 전체 상품 보기.
 */

import {
  buildTradeCityScopeFromCanonical,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";

export type TradeBrowseLocation =
  | { kind: "all" }
  | {
      kind: "city";
      canonicalId: string;
      displayName: string;
      /** Optional map center — not used for feed query in Phase 2 */
      lat?: number;
      lng?: number;
    };

export function tradeBrowseLocationEquals(
  a: TradeBrowseLocation,
  b: TradeBrowseLocation
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "all") return true;
  return (
    a.kind === "city" &&
    b.kind === "city" &&
    a.canonicalId === b.canonicalId &&
    a.displayName === b.displayName
  );
}

/** Committed URL scope → sheet draft (map coords filled later by hydrate). */
export function tradeBrowseLocationFromScope(
  scope: TradeLocationScope,
  displayName?: string | null
): TradeBrowseLocation {
  if (scope.mode === "city") {
    const name = (displayName ?? "").trim() || scope.canonicalId;
    return {
      kind: "city",
      canonicalId: scope.canonicalId,
      displayName: name,
    };
  }
  return { kind: "all" };
}

export function tradeBrowseLocationToScope(
  loc: TradeBrowseLocation
): TradeLocationScope {
  if (loc.kind === "all") return { mode: "all" };
  return (
    buildTradeCityScopeFromCanonical(loc.canonicalId) ?? {
      mode: "invalid",
      raw: loc.canonicalId,
    }
  );
}

export function cloneTradeBrowseLocation(loc: TradeBrowseLocation): TradeBrowseLocation {
  if (loc.kind === "all") return { kind: "all" };
  return {
    kind: "city",
    canonicalId: loc.canonicalId,
    displayName: loc.displayName,
    ...(typeof loc.lat === "number" ? { lat: loc.lat } : {}),
    ...(typeof loc.lng === "number" ? { lng: loc.lng } : {}),
  };
}
