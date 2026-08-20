/**
 * Trade discovery location scope — UNSET | ALL | CITY(LGU) | INVALID.
 *
 * Missing URL → UNSET (not nationwide). Explicit `location=all` is the only ALL.
 * Marketplace default CITY is hydrated onto the URL (session → Address master projection).
 *
 * URL may carry legacy product alias (`pasig`) or PSGC canonical id.
 * Cache / query authority uses canonical PSGC only.
 *
 * Browser-safe: no fs / national dataset load.
 */

import {
  getTradeLguCityDef,
  isTradeLguCityId,
  type TradeLguCityId,
} from "@/lib/trade/location/trade-lgu-city-rollup";
import {
  resolveCanonicalToLegacyProductAlias,
  resolveTradeLguUrlTokenToCanonical,
} from "@/lib/trade/location/national/legacy-product-alias-canonical";
import {
  applyTradeBrowseRadiusToSearchParams,
  parseTradeBrowseRadiusKmFromSearchParams,
  sanitizeTradeBrowseRadiusKm,
  TRADE_LOCATION_RADIUS_PARAM,
  tradeBrowseRadiusCacheSegment,
} from "@/lib/trade/location/trade-browse-radius";

export type TradeLocationScope =
  | { mode: "unset" }
  | { mode: "all" }
  | { mode: "city"; lguId: string; canonicalId: string; radiusKm: number | null }
  | { mode: "invalid"; raw: string };

export const TRADE_LOCATION_URL_PARAM = "location" as const;
export const TRADE_LOCATION_LGU_PARAM = "lgu" as const;
/** Re-export for callers that already import scope helpers */
export { TRADE_LOCATION_RADIUS_PARAM };
/** Address-book return: seed City from master once then strip */
export const TRADE_LOCATION_SEED_PARAM = "tradeLocSeed" as const;

/** Hydrate wrote these when master LGU mapping failed — safe to re-run seed. */
export const TRADE_LOCATION_HYDRATE_INVALID_RAW = {
  MASTER_LGU_UNRESOLVED: "master_lgu_unresolved",
  MASTER_HYDRATE_ERROR: "master_hydrate_error",
} as const;

export function isRecoverableTradeLocationHydrateInvalid(scope: TradeLocationScope): boolean {
  if (scope.mode !== "invalid") return false;
  return (
    scope.raw === TRADE_LOCATION_HYDRATE_INVALID_RAW.MASTER_LGU_UNRESOLVED ||
    scope.raw === TRADE_LOCATION_HYDRATE_INVALID_RAW.MASTER_HYDRATE_ERROR
  );
}

export function tradeLocationScopeEquals(a: TradeLocationScope, b: TradeLocationScope): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === "all" || a.mode === "unset") return true;
  if (a.mode === "invalid" && b.mode === "invalid") return a.raw === b.raw;
  return (
    a.mode === "city" &&
    b.mode === "city" &&
    a.canonicalId === b.canonicalId &&
    a.radiusKm === b.radiusKm
  );
}

export function parseTradeLocationScopeFromSearchParams(
  params: URLSearchParams | { get: (k: string) => string | null }
): TradeLocationScope {
  const location = (params.get(TRADE_LOCATION_URL_PARAM) ?? "").trim().toLowerCase();
  if (!location) return { mode: "unset" };
  if (location === "all") return { mode: "all" };
  if (location !== "city") return { mode: "invalid", raw: location };
  const lguRaw = (params.get(TRADE_LOCATION_LGU_PARAM) ?? "").trim();
  if (!lguRaw) return { mode: "invalid", raw: "" };

  const canonicalId = resolveTradeLguUrlTokenToCanonical(lguRaw);
  if (!canonicalId) return { mode: "invalid", raw: lguRaw };

  const legacyAlias = resolveCanonicalToLegacyProductAlias(canonicalId);
  const lguId = legacyAlias ?? canonicalId;
  const radiusKm = parseTradeBrowseRadiusKmFromSearchParams(params, true);

  return { mode: "city", lguId, canonicalId, radiusKm };
}

export function applyTradeLocationScopeToSearchParams(
  params: URLSearchParams,
  scope: TradeLocationScope
): URLSearchParams {
  let next = new URLSearchParams(params.toString());
  next.delete(TRADE_LOCATION_SEED_PARAM);
  if (scope.mode === "unset") {
    next.delete(TRADE_LOCATION_URL_PARAM);
    next.delete(TRADE_LOCATION_LGU_PARAM);
    next = applyTradeBrowseRadiusToSearchParams(next, null);
  } else if (scope.mode === "all") {
    next.set(TRADE_LOCATION_URL_PARAM, "all");
    next.delete(TRADE_LOCATION_LGU_PARAM);
    next = applyTradeBrowseRadiusToSearchParams(next, null);
  } else if (scope.mode === "invalid") {
    next.set(TRADE_LOCATION_URL_PARAM, "city");
    next.set(TRADE_LOCATION_LGU_PARAM, scope.raw || "invalid");
    next = applyTradeBrowseRadiusToSearchParams(next, null);
  } else {
    next.set(TRADE_LOCATION_URL_PARAM, "city");
    next.set(TRADE_LOCATION_LGU_PARAM, scope.lguId);
    next = applyTradeBrowseRadiusToSearchParams(
      next,
      scope.radiusKm == null ? null : sanitizeTradeBrowseRadiusKm(scope.radiusKm)
    );
  }
  return next;
}

export function tradeLocationScopeCacheSegment(scope: TradeLocationScope): string {
  if (scope.mode === "unset") return "loc:unset";
  if (scope.mode === "all") return "loc:all";
  if (scope.mode === "invalid") return `loc:invalid:${scope.raw || "_"}`;
  return `loc:lgu:${scope.canonicalId}:${tradeBrowseRadiusCacheSegment(scope.radiusKm)}`;
}

export function tradeLocationScopeDisplayLabel(scope: TradeLocationScope): string | null {
  if (scope.mode === "all" || scope.mode === "unset" || scope.mode === "invalid") return null;
  if (isTradeLguCityId(scope.lguId)) {
    return getTradeLguCityDef(scope.lguId as TradeLguCityId)?.displayName ?? null;
  }
  return peekTradeLguDisplayLabel(scope.canonicalId);
}

/** Build CITY scope from canonical PSGC (legacy alias kept in URL when available). */
export function buildTradeCityScopeFromCanonical(
  canonicalId: string,
  radiusKm: number | null = null
): Extract<TradeLocationScope, { mode: "city" }> | null {
  const cid = resolveTradeLguUrlTokenToCanonical(canonicalId);
  if (!cid) return null;
  const legacyAlias = resolveCanonicalToLegacyProductAlias(cid);
  return {
    mode: "city",
    lguId: legacyAlias ?? cid,
    canonicalId: cid,
    radiusKm: radiusKm == null ? null : sanitizeTradeBrowseRadiusKm(radiusKm),
  };
}

const TRADE_LGU_LABEL_PREFIX = "samarket:trade-lgu-label:v1:";

export function rememberTradeLguDisplayLabel(
  canonicalId: string,
  displayName: string
): void {
  const id = canonicalId.trim();
  const name = displayName.trim();
  if (!id || !name || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${TRADE_LGU_LABEL_PREFIX}${id}`, name);
  } catch {
    /* quota */
  }
}

export function peekTradeLguDisplayLabel(canonicalId: string | null | undefined): string | null {
  const id = (canonicalId ?? "").trim();
  if (!id) return null;
  if (typeof sessionStorage !== "undefined") {
    try {
      const hit = sessionStorage.getItem(`${TRADE_LGU_LABEL_PREFIX}${id}`);
      if (hit?.trim()) return hit.trim();
    } catch {
      /* ignore */
    }
  }
  const alias = resolveCanonicalToLegacyProductAlias(id);
  if (alias) return getTradeLguCityDef(alias)?.displayName ?? null;
  return null;
}

export function buildTradeLocationHref(
  pathname: string,
  currentSearch: string,
  scope: TradeLocationScope
): string {
  const params = applyTradeLocationScopeToSearchParams(
    new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch),
    scope
  );
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}
