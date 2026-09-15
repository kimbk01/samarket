/**
 * Reset marketplace location + filter state when member master address changes.
 * Browser-only (fetch + sessionStorage).
 *
 * CLASS-A reset triggers when:
 * A. master row id changes, OR
 * B. same master row id but Marketplace CITY (canonical LGU) identity changes.
 *
 * Do not key reset on address display text alone — use canonical LGU from
 * `resolveTradeMarketplaceCityScopeFromMasterRow`.
 */
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import { clearTradeBrowseLocationDraftSession } from "@/lib/trade/location/trade-browse-location-draft-session";
import {
  clearTradeBrowseCommittedScope,
  writeTradeBrowseCommittedScope,
} from "@/lib/trade/location/trade-browse-committed-session";
import {
  resolveTradeMarketplaceCityScopeFromMasterRow,
  resolveTradeMarketplaceDefaultCityFromMaster,
} from "@/lib/trade/location/resolve-trade-marketplace-default-city";
import { buildTradeLocationHref, type TradeLocationScope } from "@/lib/trade/location/trade-location-scope";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/** session: `masterId|canonicalLguId` (or `masterId|none`). Legacy: bare masterId. */
const MASTER_ADDRESS_ORIGIN_KEY = "samarket:trade-browse-master-address-id:v1";

/** Proven browse params stripped on CLASS A reset (master / 2-row / filter 전체). */
export const MARKET_BROWSE_RESET_PARAMS = [
  "category",
  "categoryIds",
  "topic",
  "topicByRoot",
  "tradeState",
  "sort",
  "fs",
  "priceMin",
  "priceMax",
  "location",
  "lgu",
  "radius",
  "page",
  "cursor",
  "q",
] as const;

function stripMarketBrowseResetSearchParams(currentSearch: string): URLSearchParams {
  const sp = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch
  );
  for (const k of MARKET_BROWSE_RESET_PARAMS) sp.delete(k);
  for (const key of [...sp.keys()]) {
    if (key.startsWith("filters[")) sp.delete(key);
  }
  return sp;
}

/** Default browse = master CITY + distance 전체; fallback nationwide ALL. */
export async function buildTradeMarketplaceDefaultBrowseHref(
  pathname: string,
  currentSearch: string
): Promise<string> {
  const sp = stripMarketBrowseResetSearchParams(currentSearch);
  const masterCity = await resolveTradeMarketplaceDefaultCityFromMaster();
  const scope: TradeLocationScope = masterCity ?? { mode: "all" };
  clearTradeBrowseLocationDraftSession();
  writeTradeBrowseCommittedScope(scope);
  return buildTradeLocationHref(pathname, sp.toString(), scope);
}

/** Test-only export — strip CLASS A reset params without master fetch. */
export function stripMarketBrowseResetSearchParamsForTests(currentSearch: string): URLSearchParams {
  return stripMarketBrowseResetSearchParams(currentSearch);
}

/** Canonical Marketplace origin fingerprint for master → browse sync. */
export function buildTradeMarketplaceMasterOriginFingerprint(
  masterId: string,
  cityScope: Extract<TradeLocationScope, { mode: "city" }> | null
): string {
  const id = masterId.trim();
  const lgu = cityScope?.canonicalId?.trim() || "none";
  return `${id}|${lgu}`;
}

export async function resolveTradeMarketplaceMasterOriginFingerprintFromMaster(
  master: UserAddressDTO
): Promise<string | null> {
  const masterId = (master.id ?? "").trim();
  if (!masterId) return null;
  const city = await resolveTradeMarketplaceCityScopeFromMasterRow(master);
  return buildTradeMarketplaceMasterOriginFingerprint(masterId, city);
}

/**
 * Returns reset href when master Marketplace origin changed since last market visit; else null.
 * First sighting / legacy key upgrade stores fingerprint without reset.
 */
export async function resolveTradeMarketplaceMasterAddressResetHref(
  pathname: string,
  currentSearch: string
): Promise<string | null> {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const snapshot = await fetchAddressDefaultsSnapshot({
      caller: "trade_location_scope",
      reason: "trade_location_seed",
    });
    const master = coerceUserAddressDTO(snapshot?.defaults?.master ?? null);
    const masterId = (master?.id ?? "").trim();
    const prev = (sessionStorage.getItem(MASTER_ADDRESS_ORIGIN_KEY) ?? "").trim();

    if (!masterId || !master) {
      if (prev) sessionStorage.removeItem(MASTER_ADDRESS_ORIGIN_KEY);
      return null;
    }

    const fingerprint = await resolveTradeMarketplaceMasterOriginFingerprintFromMaster(master);
    if (!fingerprint) return null;

    if (!prev) {
      sessionStorage.setItem(MASTER_ADDRESS_ORIGIN_KEY, fingerprint);
      return null;
    }

    // Legacy v1 stored bare master id — upgrade fingerprint without forcing reset.
    if (!prev.includes("|")) {
      if (prev === masterId) {
        sessionStorage.setItem(MASTER_ADDRESS_ORIGIN_KEY, fingerprint);
        return null;
      }
      sessionStorage.setItem(MASTER_ADDRESS_ORIGIN_KEY, fingerprint);
      clearTradeBrowseCommittedScope();
      clearTradeBrowseLocationDraftSession();
      return await buildTradeMarketplaceDefaultBrowseHref(pathname, currentSearch);
    }

    if (prev === fingerprint) return null;

    sessionStorage.setItem(MASTER_ADDRESS_ORIGIN_KEY, fingerprint);
    clearTradeBrowseCommittedScope();
    clearTradeBrowseLocationDraftSession();
    return await buildTradeMarketplaceDefaultBrowseHref(pathname, currentSearch);
  } catch {
    return null;
  }
}
