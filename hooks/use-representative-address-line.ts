"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { buildExplorationRegionSubtitleLine } from "@/lib/addresses/user-address-format";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";

export type RepresentativeAddressLineState =
  | { status: "loading" }
  | { status: "ready"; line: string | null };

function coerceMaster(raw: unknown): UserAddressDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if ("appRegionId" in o || "fullAddress" in o) {
    return o as UserAddressDTO;
  }
  return rowToUserAddressDTO(o);
}

/**
 * 대표(master) 주소 — 탐색 헤더용 **지역 한 줄**(도로·번지 제외, `buildExplorationRegionSubtitleLine`).
 * 경로 변경·뒤로 가기(popstate) 시 다시 불러와 주소 관리 반영.
 */
export function useRepresentativeAddressLine(): RepresentativeAddressLineState {
  const pathname = usePathname();
  const [state, setState] = useState<RepresentativeAddressLineState>({ status: "loading" });

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setState({ status: "loading" });
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({ force: opts?.force === true });
      if (!snapshot?.ok || !snapshot.defaults) {
        if (!silent) setState({ status: "ready", line: null });
        return;
      }
      const raw = snapshot.defaults.master;
      const m = coerceMaster(raw);
      if (!m?.id) {
        setState({ status: "ready", line: null });
        return;
      }
      const s = (buildExplorationRegionSubtitleLine(m) ?? "").trim();
      setState({ status: "ready", line: s || null });
    } catch {
      if (!silent) setState({ status: "ready", line: null });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [pathname, load]);

  useEffect(() => {
    const onPop = () => void load();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  useEffect(() => {
    /** 주소 관리 저장 직후 — 로딩 `…` 없이 갱신(깜빡임 방지) */
    const onAddressesUpdated = () => void load({ silent: true, force: true });
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [load]);

  return state;
}
