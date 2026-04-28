"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { buildExplorationRegionSubtitleLine } from "@/lib/addresses/user-address-format";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  fetchAddressDefaultsSnapshot,
  peekFreshAddressDefaultsSnapshot,
  type AddressDefaultsSnapshot,
} from "@/lib/addresses/fetch-address-defaults-client";
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

function addressLineStateFromSnapshot(snapshot: AddressDefaultsSnapshot | null): RepresentativeAddressLineState {
  if (!snapshot?.ok || !snapshot.defaults) {
    return { status: "ready", line: null };
  }
  const m = coerceMaster(snapshot.defaults.master);
  if (!m?.id) return { status: "ready", line: null };
  const s = (buildExplorationRegionSubtitleLine(m) ?? "").trim();
  return { status: "ready", line: s || null };
}

/**
 * 대표(master) 주소 — 탐색 헤더용 **지역 한 줄**(도로·번지 제외, `buildExplorationRegionSubtitleLine`).
 * 경로 변경 시 **이전 줄을 유지한 채** 백그라운드 갱신(TTL 캐시·`silent` fetch) — 탭 전환마다「불러오는 중」깜빡임 방지.
 */
export function useRepresentativeAddressLine(): RepresentativeAddressLineState {
  const pathname = usePathname();
  const [state, setState] = useState<RepresentativeAddressLineState>(() => {
    const snap = peekFreshAddressDefaultsSnapshot();
    if (!snap) return { status: "loading" };
    return addressLineStateFromSnapshot(snap);
  });

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setState({ status: "loading" });
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({ force: opts?.force === true });
      if (snapshot == null) {
        if (!silent) setState({ status: "ready", line: null });
        return;
      }
      setState(addressLineStateFromSnapshot(snapshot));
    } catch {
      if (!silent) setState({ status: "ready", line: null });
    }
  }, []);

  useEffect(() => {
    void load({ silent: true });
  }, [pathname, load]);

  useEffect(() => {
    const onPop = () => void load({ silent: true });
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
