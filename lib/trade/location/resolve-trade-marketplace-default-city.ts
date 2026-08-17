/**
 * Address SSOT → Marketplace CITY projection (no second address book).
 * Browser-only (fetch).
 */
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import {
  buildTradeCityScopeFromCanonical,
  rememberTradeLguDisplayLabel,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import { TRADE_BROWSE_RECOMMENDED_RADIUS_KM } from "@/lib/trade/location/trade-browse-radius";

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
    const cityMunicipality = (master.cityMunicipality ?? "").trim();
    const province = (master.province ?? "").trim();
    if (!cityMunicipality) return null;
    const sp = new URLSearchParams({ mode: "resolve", cityMunicipality });
    if (province) sp.set("province", province);
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
    return buildTradeCityScopeFromCanonical(canonicalId, TRADE_BROWSE_RECOMMENDED_RADIUS_KM);
  } catch {
    return null;
  }
}
