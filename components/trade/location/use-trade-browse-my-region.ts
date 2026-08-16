"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { rememberTradeLguDisplayLabel } from "@/lib/trade/location/trade-location-scope";

async function resolveMasterNationalLgu(addr: UserAddressDTO): Promise<{
  canonicalId: string;
  displayName: string;
} | null> {
  const cityMunicipality = (addr.cityMunicipality ?? "").trim();
  const province = (addr.province ?? "").trim();
  if (!cityMunicipality) return null;
  try {
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
    if (!canonicalId || !displayName) return null;
    return { canonicalId, displayName };
  } catch {
    return null;
  }
}

export function useTradeBrowseMyRegion() {
  const [myRegion, setMyRegion] = useState<{
    canonicalId: string;
    displayName: string;
  } | null>(null);
  const [myRegionLoading, setMyRegionLoading] = useState(true);

  const loadMyRegion = useCallback(async () => {
    setMyRegionLoading(true);
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({
        caller: "trade_location_scope",
        reason: "trade_location_panel",
      });
      const master = coerceUserAddressDTO(snapshot?.defaults?.master ?? null);
      if (!master?.id) {
        setMyRegion(null);
        return;
      }
      const national = await resolveMasterNationalLgu(master);
      if (!national) {
        setMyRegion(null);
        return;
      }
      rememberTradeLguDisplayLabel(national.canonicalId, national.displayName);
      setMyRegion(national);
    } catch {
      setMyRegion(null);
    } finally {
      setMyRegionLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMyRegion();
  }, [loadMyRegion]);

  return { myRegion, myRegionLoading, reloadMyRegion: loadMyRegion };
}
