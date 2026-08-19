/**
 * Reset marketplace location + filter state when member master address changes.
 * Browser-only (fetch + sessionStorage).
 */
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import { clearTradeBrowseLocationDraftSession } from "@/lib/trade/location/trade-browse-location-draft-session";
import {
  clearTradeBrowseCommittedScope,
  writeTradeBrowseCommittedScope,
} from "@/lib/trade/location/trade-browse-committed-session";
import { resolveTradeMarketplaceDefaultCityFromMaster } from "@/lib/trade/location/resolve-trade-marketplace-default-city";
import { buildTradeLocationHref, type TradeLocationScope } from "@/lib/trade/location/trade-location-scope";

const MASTER_ADDRESS_ID_KEY = "samarket:trade-browse-master-address-id:v1";

const MARKET_FILTER_PARAMS = [
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
] as const;

function stripMarketFilterParams(currentSearch: string): URLSearchParams {
  const sp = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch
  );
  for (const k of MARKET_FILTER_PARAMS) sp.delete(k);
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
  const sp = stripMarketFilterParams(currentSearch);
  const masterCity = await resolveTradeMarketplaceDefaultCityFromMaster();
  const scope: TradeLocationScope = masterCity ?? { mode: "all" };
  clearTradeBrowseLocationDraftSession();
  writeTradeBrowseCommittedScope(scope);
  return buildTradeLocationHref(pathname, sp.toString(), scope);
}

/**
 * Returns reset href when master address id changed since last market visit; else null.
 * First sighting stores id without reset.
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
    const prevId = (sessionStorage.getItem(MASTER_ADDRESS_ID_KEY) ?? "").trim();

    if (!masterId) {
      if (prevId) sessionStorage.removeItem(MASTER_ADDRESS_ID_KEY);
      return null;
    }

    if (!prevId) {
      sessionStorage.setItem(MASTER_ADDRESS_ID_KEY, masterId);
      return null;
    }

    if (prevId === masterId) return null;

    sessionStorage.setItem(MASTER_ADDRESS_ID_KEY, masterId);
    clearTradeBrowseCommittedScope();
    clearTradeBrowseLocationDraftSession();
    return await buildTradeMarketplaceDefaultBrowseHref(pathname, currentSearch);
  } catch {
    return null;
  }
}
