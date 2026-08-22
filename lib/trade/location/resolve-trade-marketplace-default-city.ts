/**
 * Address SSOT → Marketplace CITY projection (no second address book).
 * Browser-only (fetch). LGU mapping uses the existing Address → product City table.
 */
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { pickUserAddressMasterRow } from "@/lib/addresses/user-address-master-ssot";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { collectMasterCityMunicipalityCandidatesForNationalLgu } from "@/lib/trade/location/resolve-master-city-for-national-lgu";
import { resolveTradeLguCityFromInternal } from "@/lib/trade/location/trade-lgu-city-rollup";
import {
  buildTradeCityScopeFromCanonical,
  rememberTradeLguDisplayLabel,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import { tradeMarketplaceHydrateScopeBeforeMasterResolution } from "@/lib/trade/location/trade-marketplace-address-defaults-hydrate-scope";

function cityScopeFromProductLguId(
  lguId: string,
  displayName: string
): Extract<TradeLocationScope, { mode: "city" }> | null {
  const scope = buildTradeCityScopeFromCanonical(lguId, null);
  if (!scope) return null;
  if (displayName.trim()) rememberTradeLguDisplayLabel(scope.canonicalId, displayName.trim());
  return scope;
}

/** Master row → CITY + distance 전체 (radius omitted). Sync; no session, no HTTP. */
export function tradeMarketplaceCityScopeFromMasterAddress(
  master: UserAddressDTO
): Extract<TradeLocationScope, { mode: "city" }> | null {
  const appLoc = mapUserAddressToAppLocation(master);
  if (!appLoc) return null;
  const lgu = resolveTradeLguCityFromInternal(appLoc.regionId, appLoc.cityId);
  if (!lgu) return null;
  return cityScopeFromProductLguId(lgu.id, lgu.displayName);
}

async function fetchNationalLguCityScope(
  cityMunicipality: string,
  province?: string
): Promise<Extract<TradeLocationScope, { mode: "city" }> | null> {
  const sp = new URLSearchParams({ mode: "resolve", cityMunicipality });
  if (province?.trim()) sp.set("province", province.trim());

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
  return cityScopeFromProductLguId(canonicalId, displayName) ?? buildTradeCityScopeFromCanonical(canonicalId, null);
}

async function resolveNationalLguCityScopeFromMaster(
  master: UserAddressDTO
): Promise<Extract<TradeLocationScope, { mode: "city" }> | null> {
  const fromTable = tradeMarketplaceCityScopeFromMasterAddress(master);
  if (fromTable) return fromTable;

  const candidates = collectMasterCityMunicipalityCandidatesForNationalLgu(master);
  for (const fields of candidates) {
    const withProvince = await fetchNationalLguCityScope(
      fields.cityMunicipality,
      fields.province || undefined
    );
    if (withProvince) return withProvince;
    if (fields.province) {
      const withoutProvince = await fetchNationalLguCityScope(fields.cityMunicipality);
      if (withoutProvince) return withoutProvince;
    }
  }
  return null;
}

/**
 * UNSET URL hydrate — current address-book master is authority.
 * CITY + distance 전체. No master → ALL. Do not write ALL while master exists and maps.
 * Guest confirmed (anonymous boot | terminal guest) + address-defaults 401/403 → ALL.
 * Other !ok → UNSET (no URL write).
 */
export async function resolveTradeMarketplaceMasterHydrateScope(): Promise<TradeLocationScope> {
  try {
    const snapshot = await fetchAddressDefaultsSnapshot({
      caller: "trade_location_scope",
      reason: "trade_location_seed",
    });

    const beforeMaster = tradeMarketplaceHydrateScopeBeforeMasterResolution(snapshot);
    if (beforeMaster) return beforeMaster;
    if (!snapshot?.ok) return { mode: "unset" };

    const master = pickUserAddressMasterRow(snapshot.defaults);
    if (!master) return { mode: "all" };

    const city = await resolveNationalLguCityScopeFromMaster(master);
    return city ?? { mode: "all" };
  } catch {
    return { mode: "unset" };
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
    if (!snapshot?.ok) return null;
    const master = pickUserAddressMasterRow(snapshot.defaults);
    if (!master) return null;
    return await resolveNationalLguCityScopeFromMaster(master);
  } catch {
    return null;
  }
}
