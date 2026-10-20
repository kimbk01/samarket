"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { useRegionViewerUserId } from "@/hooks/useRegionViewerUserId";
import {
  buildExplicitCommunityLocalFilter,
  communityLocalFilterLocationKey,
  communityLocalFilterLocationMeta,
  formatCommunityLocalFilterLabel,
  readCommunityLocalFilter,
  resolveCommunityLocalFilterAgainstMaster,
  type CommunityLocalFilterState,
  writeCommunityLocalFilter,
} from "@/lib/community/community-local-filter-ssot";

function masterFromSnapshot(snapshot: Awaited<ReturnType<typeof fetchAddressDefaultsSnapshot>>): UserAddressDTO | null {
  if (!snapshot?.ok || !snapshot.defaults?.master) return null;
  return coerceUserAddressDTO(snapshot.defaults.master);
}

/**
 * Community Local feed filter — independent of RegionContext/profiles.
 * Seed = member master City; explicit selection does not mutate primary.
 */
export function useCommunityLocalFilter(): {
  ready: boolean;
  filter: CommunityLocalFilterState | null;
  locationKey: string;
  locationMeta: ReturnType<typeof communityLocalFilterLocationMeta>;
  filterLabel: string;
  setExplicitFilter: (regionId: string, cityId: string, barangay?: string) => boolean;
  reseedFromMaster: () => Promise<void>;
} {
  const userId = useRegionViewerUserId();
  const [filter, setFilter] = useState<CommunityLocalFilterState | null>(null);
  const [ready, setReady] = useState(false);

  const applyResolved = useCallback(
    (next: CommunityLocalFilterState | null) => {
      setFilter(next);
      if (next && userId && userId !== "guest") {
        writeCommunityLocalFilter(userId, next);
      }
    },
    [userId],
  );

  /** 최신 sync 만 반영 — 늦게 끝난 이전 요청이 새 결과를 덮어쓰지 않게 (ADDR-SSOT-005) */
  const syncSeqRef = useRef(0);

  const syncFromMaster = useCallback(
    async (opts?: { force?: boolean }) => {
      const seq = ++syncSeqRef.current;
      if (!userId || userId === "guest") {
        setFilter(null);
        setReady(true);
        return;
      }
      const snapshot = await fetchAddressDefaultsSnapshot({
        caller: "community_local_filter",
        reason: opts?.force ? "community_local_filter_force" : "community_local_filter_boot",
      });
      if (seq !== syncSeqRef.current) return;
      const existing = readCommunityLocalFilter(userId);
      /** 주소 조회 실패 — 대표 주소 없음으로 간주하지 않고 기존 필터 유지 */
      if (!snapshot?.ok) {
        applyResolved(existing);
        setReady(true);
        return;
      }
      const master = masterFromSnapshot(snapshot);
      const resolved = resolveCommunityLocalFilterAgainstMaster(existing, master);
      applyResolved(resolved);
      setReady(true);
    },
    [userId, applyResolved],
  );

  useEffect(() => {
    setReady(false);
    void syncFromMaster();
    return () => {
      /** 언마운트·viewer 전환 — 진행 중 sync 결과 폐기 */
      syncSeqRef.current += 1;
    };
  }, [syncFromMaster]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onAddresses = () => {
      void syncFromMaster({ force: true });
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddresses);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddresses);
  }, [syncFromMaster]);

  const setExplicitFilter = useCallback(
    (regionId: string, cityId: string, barangay = "") => {
      if (!userId || userId === "guest") return false;
      const next = buildExplicitCommunityLocalFilter(regionId, cityId, barangay);
      if (!next) return false;
      applyResolved(next);
      return true;
    },
    [userId, applyResolved],
  );

  const locationKey = useMemo(() => communityLocalFilterLocationKey(filter), [filter]);
  const locationMeta = useMemo(() => communityLocalFilterLocationMeta(filter), [filter]);
  const filterLabel = useMemo(() => formatCommunityLocalFilterLabel(filter), [filter]);

  return {
    ready,
    filter,
    locationKey,
    locationMeta,
    filterLabel,
    setExplicitFilter,
    reseedFromMaster: () => syncFromMaster({ force: true }),
  };
}
