/**
 * Address SSOT → Marketplace CITY projection (no second address book).
 * Browser-only (fetch).
 */
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { pickUserAddressMasterRow } from "@/lib/addresses/user-address-master-ssot";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { collectMasterCityMunicipalityCandidatesForNationalLgu } from "@/lib/trade/location/resolve-master-city-for-national-lgu";
import {
  buildTradeCityScopeFromCanonical,
  rememberTradeLguDisplayLabel,
  TRADE_LOCATION_HYDRATE_INVALID_RAW,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";

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
    ok?: boolean;
    resolution?: {
      status?: string;
      canonicalId?: string;
      lgu?: { displayName?: string; canonicalId?: string };
    };
  };
  if (json.ok === false || json.resolution?.status !== "resolved") return null;

  const canonicalId =
    (typeof json.resolution?.canonicalId === "string" && json.resolution.canonicalId) ||
    (typeof json.resolution?.lgu?.canonicalId === "string" && json.resolution.lgu.canonicalId) ||
    "";
  const displayName =
    (typeof json.resolution?.lgu?.displayName === "string" &&
      json.resolution.lgu.displayName.trim()) ||
    "";
  if (!canonicalId) return null;
  if (displayName) rememberTradeLguDisplayLabel(canonicalId, displayName);
  return buildTradeCityScopeFromCanonical(canonicalId, null);
}

async function resolveNationalLguCityScopeFromMaster(
  master: UserAddressDTO
): Promise<Extract<TradeLocationScope, { mode: "city" }> | null> {
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

async function ensureViewerReadyForAddressDefaults(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  if (getCurrentUser()?.id?.trim()) return true;
  const uid = (await getCurrentUserIdForDb())?.trim();
  return Boolean(uid);
}

/**
 * UNSET URL hydrate — no master → ALL; master with LGU resolve fail → invalid (not silent ALL).
 * Session/defaults not ready → recoverable invalid (boot retry), not silent ALL.
 */
export async function resolveTradeMarketplaceMasterHydrateScope(opts?: {
  forceAddressRefresh?: boolean;
}): Promise<TradeLocationScope> {
  try {
    if (!(await ensureViewerReadyForAddressDefaults())) {
      return { mode: "invalid", raw: TRADE_LOCATION_HYDRATE_INVALID_RAW.MASTER_HYDRATE_ERROR };
    }

    const snapshot = await fetchAddressDefaultsSnapshot({
      caller: "trade_location_scope",
      reason: "trade_location_seed",
      force: opts?.forceAddressRefresh === true,
    });

    if (!snapshot?.ok) {
      return { mode: "invalid", raw: TRADE_LOCATION_HYDRATE_INVALID_RAW.MASTER_HYDRATE_ERROR };
    }

    const master = pickUserAddressMasterRow(snapshot.defaults);
    if (!master) return { mode: "all" };

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
    if (!snapshot?.ok) return null;
    const master = pickUserAddressMasterRow(snapshot.defaults);
    if (!master) return null;
    return await resolveNationalLguCityScopeFromMaster(master);
  } catch {
    return null;
  }
}
