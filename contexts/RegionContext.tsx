"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { UserRegion } from "@/lib/regions/types";
import {
  getCurrentUserId,
  getUserRegions,
  getPrimaryRegion,
  addUserRegion as addUserRegionMock,
  removeUserRegion as removeUserRegionMock,
  setPrimaryUserRegion as setPrimaryUserRegionMock,
} from "@/lib/regions/mock-user-regions";
import { getRegionName } from "@/lib/regions/region-utils";

type RegionContextValue = {
  userRegions: UserRegion[];
  primaryRegion: UserRegion | null;
  currentRegion: UserRegion | null;
  /** 홈/검색 필터용 지역명 (currentRegion 기준) */
  currentRegionName: string | null;
  setCurrentRegion: (id: string) => void;
  setPrimaryRegion: (id: string) => void;
  addRegion: (
    regionId: string,
    cityId: string,
    barangay: string,
    setAsPrimary: boolean
  ) => UserRegion;
  removeRegion: (id: string) => boolean;
  refreshUserRegions: () => void;
};

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({ children }: { children: React.ReactNode }) {
  const userId = getCurrentUserId();
  const [userRegions, setUserRegions] = useState<UserRegion[]>(() =>
    getUserRegions(userId)
  );
  const [currentRegionId, setCurrentRegionId] = useState<string | null>(null);

  const refreshUserRegions = useCallback(() => {
    setUserRegions(getUserRegions(userId));
  }, [userId]);

  useEffect(() => {
    refreshUserRegions();
  }, [refreshUserRegions]);

  const primaryRegion = useMemo(
    () => userRegions.find((r) => r.isPrimary) ?? userRegions[0] ?? null,
    [userRegions]
  );

  const currentRegion = useMemo(() => {
    if (currentRegionId) {
      const r = userRegions.find((r) => r.id === currentRegionId);
      if (r) return r;
    }
    return primaryRegion;
  }, [userRegions, currentRegionId, primaryRegion]);

  useEffect(() => {
    if (primaryRegion && !currentRegionId) setCurrentRegionId(primaryRegion.id);
  }, [primaryRegion?.id, currentRegionId]);

  const currentRegionName = currentRegion
    ? getRegionName(currentRegion.regionId)
    : null;

  const setCurrentRegion = useCallback((id: string) => {
    setCurrentRegionId(id);
  }, []);

  const setPrimaryRegion = useCallback(
    (id: string) => {
      if (setPrimaryUserRegionMock(userId, id)) refreshUserRegions();
    },
    [userId, refreshUserRegions]
  );

  const addRegion = useCallback(
    (
      regionId: string,
      cityId: string,
      barangay: string,
      setAsPrimary: boolean
    ) => {
      const added = addUserRegionMock(userId, regionId, cityId, barangay, setAsPrimary);
      refreshUserRegions();
      return added;
    },
    [userId, refreshUserRegions]
  );

  const removeRegion = useCallback(
    (id: string) => {
      const ok = removeUserRegionMock(userId, id);
      if (ok) {
        refreshUserRegions();
        setCurrentRegionId((prev) => (prev === id ? null : prev));
      }
      return ok;
    },
    [userId, refreshUserRegions]
  );

  const value = useMemo(
    () => ({
      userRegions,
      primaryRegion,
      currentRegion,
      currentRegionName,
      setCurrentRegion,
      setPrimaryRegion,
      addRegion,
      removeRegion,
      refreshUserRegions,
    }),
    [
      userRegions,
      primaryRegion,
      currentRegion,
      currentRegionName,
      setCurrentRegion,
      setPrimaryRegion,
      addRegion,
      removeRegion,
      refreshUserRegions,
    ]
  );

  return (
    <RegionContext.Provider value={value}>{children}</RegionContext.Provider>
  );
}

export function useRegion() {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegion must be used within RegionProvider");
  return ctx;
}

/** Provider 밖(예: 일부 프리뷰·경계)에서도 안전 — 없으면 null */
export function useRegionOptional(): RegionContextValue | null {
  return useContext(RegionContext);
}
