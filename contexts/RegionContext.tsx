"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { UserRegion } from "@/lib/regions/types";
import {
  getUserRegions,
  addUserRegion as addUserRegionMock,
  removeUserRegion as removeUserRegionMock,
  setPrimaryUserRegion as setPrimaryUserRegionMock,
} from "@/lib/regions/mock-user-regions";
import { useRegionMockUserId } from "@/hooks/useRegionMockUserId";
import { userRegionFromProfileSlice } from "@/lib/regions/profile-to-user-region";
import { getRegionName } from "@/lib/regions/region-utils";
import { fetchMeProfileDeduped, ME_PROFILE_CACHE_INVALIDATED_EVENT, isMeProfileCacheFresh, peekMeProfileCached } from "@/lib/profile/fetch-me-profile-deduped";
import { isStoreOwnerAdminPathname } from "@/lib/business/owner-hub-path";
import {
  getAppBootSnapshot,
  isAppBootReady,
  peekAppBootProfile,
} from "@/lib/app-boot/app-boot-store";
import { APP_BOOT_READY_EVENT, APP_BOOT_PROFILE_UPDATED_EVENT } from "@/lib/app-boot/app-boot-types";
import {
  cancelScheduledWhenBrowserIdle,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";

type RegionContextValue = {
  userRegions: UserRegion[];
  primaryRegion: UserRegion | null;
  currentRegion: UserRegion | null;
  /** 홈/검색 필터용 지역명 (currentRegion 기준) */
  currentRegionName: string | null;
  /** 프로필에 유효한 지역이 있으면 true — 매장 피드·동네 표시의 기준 */
  profileLocationActive: boolean;
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
  /** 프로필(region_code/region_name) 다시 불러와 primary 에 반영 */
  refreshProfileLocation: () => Promise<void>;
};

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({ children }: { children: React.ReactNode }) {
  const userId = useRegionMockUserId();
  const profileInvalidateIdleRef = useRef<number | null>(null);
  const [userRegions, setUserRegions] = useState<UserRegion[]>(() => getUserRegions(userId));
  const [currentRegionId, setCurrentRegionId] = useState<string | null>(null);
  const [profileSourcedRegion, setProfileSourcedRegion] = useState<UserRegion | null>(null);

  const refreshUserRegions = useCallback(() => {
    setUserRegions(getUserRegions(userId));
  }, [userId]);

  const applyProfileSlice = useCallback((p: Record<string, unknown>) => {
      const next = userRegionFromProfileSlice({
        region_code: typeof p.region_code === "string" ? p.region_code : null,
        region_name: typeof p.region_name === "string" ? p.region_name : null,
        address_detail: typeof p.address_detail === "string" ? p.address_detail : null,
        full_address: typeof p.full_address === "string" ? p.full_address : null,
      });
      setProfileSourcedRegion((prev) => {
        if (next == null && prev == null) return prev;
        if (next == null) return null;
        if (
          prev &&
          prev.regionId === next.regionId &&
          prev.cityId === next.cityId &&
          prev.barangay === next.barangay &&
          prev.label === next.label
        ) {
          return prev;
        }
        return next;
      });
  }, []);

  const refreshProfileLocation = useCallback(async () => {
    try {
      if (getAppBootSnapshot().status === "anonymous") {
        setProfileSourcedRegion(null);
        return;
      }
      const boot = peekAppBootProfile();
      if (boot) {
        applyProfileSlice(boot as unknown as Record<string, unknown>);
        return;
      }
      if (isMeProfileCacheFresh()) {
        const cached = peekMeProfileCached();
        const profile = (cached?.json as { ok?: boolean; profile?: Record<string, unknown> | null } | undefined)
          ?.profile;
        if (profile) {
          applyProfileSlice(profile);
          return;
        }
      }
      /** 매장 운영 — boot lite 만 사용, `profile?mode=full` 왕복 금지 */
      if (isStoreOwnerAdminPathname()) {
        return;
      }
      const { status, json: raw } = await fetchMeProfileDeduped("region_provider");
      const json = raw as { ok?: boolean; profile?: Record<string, unknown> | null };
      if (status < 200 || status >= 300 || !json?.ok || !json.profile) {
        setProfileSourcedRegion(null);
        return;
      }
      const p = json.profile;
      applyProfileSlice(p);
    } catch {
      setProfileSourcedRegion(null);
    }
  }, [applyProfileSlice]);

  /** 로그인 계정이 바뀌면 mock 동네 버킷·현재 선택을 분리하고 프로필 지역을 다시 맞춤 */
  useEffect(() => {
    setUserRegions(getUserRegions(userId));
    setCurrentRegionId(null);
    const boot = peekAppBootProfile();
    if (boot) {
      applyProfileSlice(boot as unknown as Record<string, unknown>);
      return;
    }
    /** 허브 첫 페인트 — `APP_BOOT_READY` 전에 profile full 금지 */
    if (isStoreOwnerAdminPathname()) {
      return;
    }
    let idleId: number | null = null;
    const scheduleRegionSync = () => {
      const bootNow = peekAppBootProfile();
      if (bootNow) {
        applyProfileSlice(bootNow as unknown as Record<string, unknown>);
        return;
      }
      if (getAppBootSnapshot().status === "anonymous") return;
      idleId = scheduleWhenBrowserIdle(() => {
        void refreshProfileLocation();
      }, 0);
    };
    if (isAppBootReady()) {
      scheduleRegionSync();
    } else {
      const onBootReady = () => {
        window.removeEventListener(APP_BOOT_READY_EVENT, onBootReady);
        scheduleRegionSync();
      };
      window.addEventListener(APP_BOOT_READY_EVENT, onBootReady);
      return () => {
        window.removeEventListener(APP_BOOT_READY_EVENT, onBootReady);
        if (idleId != null) cancelScheduledWhenBrowserIdle(idleId);
      };
    }
    return () => {
      if (idleId != null) cancelScheduledWhenBrowserIdle(idleId);
    };
  }, [userId, refreshProfileLocation, applyProfileSlice]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBoot = () => {
      if (getAppBootSnapshot().status === "anonymous") {
        setProfileSourcedRegion(null);
        return;
      }
      const boot = peekAppBootProfile();
      if (boot) {
        applyProfileSlice(boot as unknown as Record<string, unknown>);
        return;
      }
      if (isStoreOwnerAdminPathname()) return;
      void refreshProfileLocation();
    };
    window.addEventListener(APP_BOOT_READY_EVENT, onBoot);
    window.addEventListener(APP_BOOT_PROFILE_UPDATED_EVENT, onBoot);
    return () => {
      window.removeEventListener(APP_BOOT_READY_EVENT, onBoot);
      window.removeEventListener(APP_BOOT_PROFILE_UPDATED_EVENT, onBoot);
    };
  }, [refreshProfileLocation, applyProfileSlice]);

  /** 프로필 캐시 무효화(저장·아바타·세션) — 단일 이벤트로 지역 상태 동기화 */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onInvalidated = () => {
      if (profileInvalidateIdleRef.current != null) {
        cancelScheduledWhenBrowserIdle(profileInvalidateIdleRef.current);
        profileInvalidateIdleRef.current = null;
      }
      profileInvalidateIdleRef.current = scheduleWhenBrowserIdle(() => {
        profileInvalidateIdleRef.current = null;
        void refreshProfileLocation();
      }, 0);
    };
    window.addEventListener(ME_PROFILE_CACHE_INVALIDATED_EVENT, onInvalidated);
    return () => {
      window.removeEventListener(ME_PROFILE_CACHE_INVALIDATED_EVENT, onInvalidated);
      if (profileInvalidateIdleRef.current != null) {
        cancelScheduledWhenBrowserIdle(profileInvalidateIdleRef.current);
        profileInvalidateIdleRef.current = null;
      }
    };
  }, [refreshProfileLocation]);

  const mockPrimaryRegion = useMemo(
    () => userRegions.find((r) => r.isPrimary) ?? userRegions[0] ?? null,
    [userRegions]
  );

  /** 내정보 프로필 주소가 채워져 있으면 mock 동네보다 우선 */
  const primaryRegion = profileSourcedRegion ?? mockPrimaryRegion;

  const currentRegion = useMemo(() => {
    if (currentRegionId) {
      if (profileSourcedRegion && currentRegionId === profileSourcedRegion.id) {
        return profileSourcedRegion;
      }
      const r = userRegions.find((r) => r.id === currentRegionId);
      if (r) return r;
    }
    return primaryRegion;
  }, [userRegions, currentRegionId, primaryRegion, profileSourcedRegion]);

  useEffect(() => {
    if (primaryRegion && !currentRegionId) setCurrentRegionId(primaryRegion.id);
  }, [primaryRegion, currentRegionId]);

  /** 프로필 지역이 있으면 현재 동네 id 를 프로필 행으로 맞춤 — userRegions 참조 변경만으로는 재실행하지 않음 */
  useEffect(() => {
    if (!profileSourcedRegion) return;
    setCurrentRegionId((prev) =>
      prev === profileSourcedRegion.id ? prev : profileSourcedRegion.id
    );
  }, [profileSourcedRegion]);

  /** 프로필 지역이 비면 profile-location 선택 상태만 mock 으로 복귀 */
  useEffect(() => {
    if (profileSourcedRegion) return;
    setCurrentRegionId((prev) => {
      if (prev !== "profile-location") return prev;
      const mockPrimary = userRegions.find((r) => r.isPrimary) ?? userRegions[0];
      return mockPrimary?.id ?? null;
    });
  }, [profileSourcedRegion, userRegions]);

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

  const profileLocationActive = profileSourcedRegion != null;

  const value = useMemo(
    () => ({
      userRegions,
      primaryRegion,
      currentRegion,
      currentRegionName,
      profileLocationActive,
      setCurrentRegion,
      setPrimaryRegion,
      addRegion,
      removeRegion,
      refreshUserRegions,
      refreshProfileLocation,
    }),
    [
      userRegions,
      primaryRegion,
      currentRegion,
      currentRegionName,
      profileLocationActive,
      setCurrentRegion,
      setPrimaryRegion,
      addRegion,
      removeRegion,
      refreshUserRegions,
      refreshProfileLocation,
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
