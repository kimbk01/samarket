"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { rememberTradeLguDisplayLabel } from "@/lib/trade/location/trade-location-scope";

export type TradeBrowseMyRegion = {
  canonicalId: string;
  displayName: string;
};

/**
 * `missing` = 대표주소 없음·LGU 미해결(정상 빈 상태).
 * `error` = 네트워크·5xx 등 일시 실패 — 「없음」으로 오인하지 않고 재시도 가능.
 */
export type TradeBrowseMyRegionLoadResult =
  | { status: "ready"; region: TradeBrowseMyRegion }
  | { status: "missing" }
  | { status: "error" };

async function resolveMasterNationalLgu(
  addr: UserAddressDTO
): Promise<TradeBrowseMyRegionLoadResult> {
  const cityMunicipality = (addr.cityMunicipality ?? "").trim();
  const province = (addr.province ?? "").trim();
  if (!cityMunicipality) return { status: "missing" };
  try {
    const sp = new URLSearchParams({ mode: "resolve", cityMunicipality });
    if (province) sp.set("province", province);
    const res = await fetch(`/api/trade/national-lgu?${sp.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return { status: "error" };
    const json = (await res.json()) as {
      resolution?: {
        status?: string;
        canonicalId?: string;
        lgu?: { displayName?: string; canonicalId?: string };
      };
    };
    if (json.resolution?.status !== "resolved") return { status: "missing" };
    const canonicalId =
      (typeof json.resolution.canonicalId === "string" && json.resolution.canonicalId) ||
      (typeof json.resolution.lgu?.canonicalId === "string" && json.resolution.lgu.canonicalId) ||
      "";
    const displayName =
      (typeof json.resolution.lgu?.displayName === "string" &&
        json.resolution.lgu.displayName.trim()) ||
      "";
    if (!canonicalId || !displayName) return { status: "missing" };
    return { status: "ready", region: { canonicalId, displayName } };
  } catch {
    return { status: "error" };
  }
}

/** 대표주소 → 거래 LGU (표시 전용 — `/market` hydrate 와 별개, URL 을 바꾸지 않음). */
export async function loadTradeBrowseMyRegion(): Promise<TradeBrowseMyRegionLoadResult> {
  try {
    const snapshot = await fetchAddressDefaultsSnapshot({
      caller: "trade_location_scope",
      reason: "trade_location_panel",
    });
    if (!snapshot) return { status: "error" };
    if (!snapshot.ok) {
      /** 401/403 = 비로그인·세션 없음 → 대표주소 없음과 동일. 그 외 !ok 는 일시 실패. */
      return snapshot.status === 401 || snapshot.status === 403
        ? { status: "missing" }
        : { status: "error" };
    }
    const master = coerceUserAddressDTO(snapshot.defaults?.master ?? null);
    if (!master?.id) return { status: "missing" };
    const result = await resolveMasterNationalLgu(master);
    if (result.status === "ready") {
      rememberTradeLguDisplayLabel(result.region.canonicalId, result.region.displayName);
    }
    return result;
  } catch {
    return { status: "error" };
  }
}

export function useTradeBrowseMyRegion() {
  const [myRegion, setMyRegion] = useState<TradeBrowseMyRegion | null>(null);
  const [myRegionLoading, setMyRegionLoading] = useState(true);
  const [myRegionError, setMyRegionError] = useState(false);

  const loadMyRegion = useCallback(async () => {
    setMyRegionLoading(true);
    setMyRegionError(false);
    try {
      const result = await loadTradeBrowseMyRegion();
      if (result.status === "ready") {
        setMyRegion(result.region);
      } else if (result.status === "missing") {
        setMyRegion(null);
      } else {
        setMyRegionError(true);
      }
    } finally {
      setMyRegionLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMyRegion();
  }, [loadMyRegion]);

  return { myRegion, myRegionLoading, myRegionError, reloadMyRegion: loadMyRegion };
}
