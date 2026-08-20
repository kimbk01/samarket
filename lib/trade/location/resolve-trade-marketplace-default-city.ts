/**
 * Address SSOT → Marketplace CITY projection (no second address book).
 * Browser-only (fetch).
 */
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { resolveMasterCityMunicipalityForNationalLgu } from "@/lib/trade/location/resolve-master-city-for-national-lgu";
import {
  buildTradeCityScopeFromCanonical,
  rememberTradeLguDisplayLabel,
  TRADE_LOCATION_HYDRATE_INVALID_RAW,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";

async function resolveNationalLguCityScopeFromMaster(
  master: UserAddressDTO
): Promise<Extract<TradeLocationScope, { mode: "city" }> | null> {
  const fields = resolveMasterCityMunicipalityForNationalLgu(master);
  if (!fields) return null;

  const sp = new URLSearchParams({ mode: "resolve", cityMunicipality: fields.cityMunicipality });
  if (fields.province) sp.set("province", fields.province);

  const res = await fetch(`/api/trade/national-lgu?${sp.toString()}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    resolution?: {
      status?: string;
      canonicalId?: string;
      lgu?: { displayName?: string; canonicalId?: string };
    };
  };
  if (json.resolution?.status !== "resolved") return null;

  const canonicalId =
    (typeof json.resolution.canonicalId === "string" && json.resolution.canonicalId) ||
    (typeof json.resolution.lgu?.canonicalId === "string" && json.resolution.lgu.canonicalId) ||
    "";
  const displayName =
    (typeof json.resolution.lgu?.displayName === "string" &&
      json.resolution.lgu.displayName.trim()) ||
    "";
  if (!canonicalId) return null;
  if (displayName) rememberTradeLguDisplayLabel(canonicalId, displayName);
  return buildTradeCityScopeFromCanonical(canonicalId, null);
}

/**
 * UNSET URL hydrate — no master → ALL; master with LGU resolve fail → invalid (not silent ALL).
 */
export async function resolveTradeMarketplaceMasterHydrateScope(opts?: {
  forceAddressRefresh?: boolean;
}): Promise<TradeLocationScope> {
  try {
    const snapshot = await fetchAddressDefaultsSnapshot({
      caller: "trade_location_scope",
      reason: "trade_location_seed",
      force: opts?.forceAddressRefresh === true,
    });
    const master = coerceUserAddressDTO(snapshot?.defaults?.master ?? null);
    if (!master?.id) return { mode: "all" };
    const city = await resolveNationalLguCityScopeFromMaster(master);
    if (city) return city;
    return { mode: "invalid", raw: TRADE_LOCATION_HYDRATE_INVALID_RAW.MASTER_LGU_UNRESOLVED };
  } catch {
    return { mode: "invalid", raw: TRADE_LOCATION_HYDRATE_INVALID_RAW.MASTER_HYDRATE_ERROR };
  }
}

export async function resolveTradeMarketplaceDefaultCityFromMaster(): Promise<
  Extract<TradeLocationScope, { mode: "city" }> | null
> {
  try {
    const snapshot = await fetchAddressDefaultsSnapshot({
      caller: "trade_location_scope",
      reason: "trade_location_seed",
    });
    const master = coerceUserAddressDTO(snapshot?.defaults?.master ?? null);
    if (!master?.id) return null;
    return await resolveNationalLguCityScopeFromMaster(master);
  } catch {
    return null;
  }
}
