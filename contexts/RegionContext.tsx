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
} from "@/lib/regions/user-regions-local-store";
import { useRegionViewerUserId } from "@/hooks/useRegionViewerUserId";
import { userRegionFromProfileSlice } from "@/lib/regions/profile-to-user-region";
import {
  MASTER_ADDRESS_REGION_ID,
  PROFILE_LOCATION_REGION_ID,
  sameCityUserRegion,
  userRegionFromAddressDefaultsSnapshot,
} from "@/lib/regions/master-address-to-user-region";
import {
  fetchAddressDefaultsSnapshot,
  peekFreshAddressDefaultsSnapshot,
} from "@/lib/addresses/fetch-address-defaults-client";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
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
  /** 대표 주소(또는 첫 페인트 프로필 폴백) 지역이 있으면 true — 매장 피드·동네 표시의 기준 */
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
  /** 대표 주소·프로필 지역을 다시 읽어 primary 에 반영 (대표 주소가 권위) */
  refreshProfileLocation: () => Promise<void>;
};

const RegionContext = createContext<RegionContextValue | null>(null);

/** 대표 주소 스냅샷 수신 실패 시 재시도 간격 — 소진되면 이전 값 유지 후 중단 */
const MASTER_REGION_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

/** 첫 페인트 — TTL 안 대표 주소 스냅샷이 있으면 동기 반영 (undefined = 미확정) */
function peekMasterRegionForViewer(userId: string): UserRegion | null | undefined {
  if (userId === "guest") return undefined;
  const peek = userRegionFromAddressDefaultsSnapshot(peekFreshAddressDefaultsSnapshot(), userId);
  return peek.kind === "resolved" ? peek.region : undefined;
}

export function RegionProvider({ children }: { children: React.ReactNode }) {
  const userId = useRegionViewerUserId();
  const profileInvalidateIdleRef = useRef<number | null>(null);
  const [userRegions, setUserRegions] = useState<UserRegion[]>(() => getUserRegions(userId));
  const [currentRegionId, setCurrentRegionId] = useState<string | null>(null);
  /** profiles.region_* City 폴백 — 대표 주소 확정 전 첫 페인트 전용 (barangay 항상 "") */
  const [profileFallbackRegion, setProfileFallbackRegion] = useState<UserRegion | null>(null);
  /**
   * ADDR-SSOT-002 — 회원 대표 주소(user_addresses.is_default_master) City.
   * undefined = 아직 미확정(프로필 폴백 사용), null = 대표 주소 없음.
   */
  const [masterRegion, setMasterRegion] = useState<UserRegion | null | undefined>(() =>
    peekMasterRegionForViewer(userId)
  );
  const masterSeqRef = useRef(0);
  const masterRetryAttemptRef = useRef(0);
  const masterRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncMasterRegionRef = useRef<((opts?: { force?: boolean; retry?: boolean }) => Promise<void>) | null>(
    null
  );

  /** 대표 주소가 확정되면 프로필 폴백보다 항상 우선 */
  const profileSourcedRegion: UserRegion | null =
    masterRegion !== undefined ? masterRegion : profileFallbackRegion;

  const refreshUserRegions = useCallback(() => {
    setUserRegions(getUserRegions(userId));
  }, [userId]);

  const applyProfileSlice = useCallback((p: Record<string, unknown>) => {
      const next = userRegionFromProfileSlice({
        region_code: typeof p.region_code === "string" ? p.region_code : null,
        region_name: typeof p.region_name === "string" ? p.region_name : null,
        full_address: typeof p.full_address === "string" ? p.full_address : null,
      });
      setProfileFallbackRegion((prev) => (sameCityUserRegion(prev, next) ? prev : next));
  }, []);

  const clearMasterRetry = useCallback(() => {
    if (masterRetryTimerRef.current != null) {
      clearTimeout(masterRetryTimerRef.current);
      masterRetryTimerRef.current = null;
    }
  }, []);

  /** 로그아웃·계정 전환 — 진행 중 대표 주소 응답·재시도 폐기 */
  const resetMasterRegion = useCallback(() => {
    masterSeqRef.current += 1;
    masterRetryAttemptRef.current = 0;
    clearMasterRetry();
    setMasterRegion(undefined);
  }, [clearMasterRetry]);

  /**
   * 대표 주소 → primary City. 최신 요청만 반영(seq), 실패 시 이전 값 유지 + 1s·2s·4s 재시도 후 중단.
   */
  const syncMasterRegion = useCallback(
    async (opts?: { force?: boolean; retry?: boolean }) => {
      if (userId === "guest") return;
      const viewerId = getCurrentUser()?.id ?? null;
      if (!viewerId || viewerId !== userId) return;
      if (!opts?.retry) {
        masterRetryAttemptRef.current = 0;
        clearMasterRetry();
      }
      const seq = ++masterSeqRef.current;
      const snapshot = await fetchAddressDefaultsSnapshot({
        caller: "region_context",
        reason: opts?.force ? "region_context_force" : "region_context_boot",
        force: opts?.force === true,
      });
      if (seq !== masterSeqRef.current) return;
      if ((getCurrentUser()?.id ?? null) !== viewerId) return;
      const result = userRegionFromAddressDefaultsSnapshot(snapshot, viewerId);
      if (result.kind === "unavailable") {
        const attempt = masterRetryAttemptRef.current;
        if (attempt >= MASTER_REGION_RETRY_DELAYS_MS.length) return;
        masterRetryAttemptRef.current = attempt + 1;
        clearMasterRetry();
        masterRetryTimerRef.current = setTimeout(() => {
          masterRetryTimerRef.current = null;
          void syncMasterRegionRef.current?.({ force: opts?.force, retry: true });
        }, MASTER_REGION_RETRY_DELAYS_MS[attempt]);
        return;
      }
      masterRetryAttemptRef.current = 0;
      const next = result.region;
      setMasterRegion((prev) =>
        prev !== undefined && sameCityUserRegion(prev, next) ? prev : next
      );
    },
    [userId, clearMasterRetry]
  );

  useEffect(() => {
    syncMasterRegionRef.current = syncMasterRegion;
  }, [syncMasterRegion]);

  useEffect(() => () => clearMasterRetry(), [clearMasterRetry]);

  const refreshProfileLocation = useCallback(async () => {
    try {
      if (getAppBootSnapshot().status === "anonymous") {
        setProfileFallbackRegion(null);
        return;
      }
      /** 대표 주소가 권위 — 프로필 경로는 첫 페인트 폴백만 갱신 */
      void syncMasterRegion();
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
        setProfileFallbackRegion(null);
        return;
      }
      const p = json.profile;
      applyProfileSlice(p);
    } catch {
      setProfileFallbackRegion(null);
    }
  }, [applyProfileSlice, syncMasterRegion]);

  /** 로그아웃·비회원 — 프로필·mock 동네 표시 제거(헤더 주소 잔존 방지) */
  useEffect(() => {
    if (userId === "guest") {
      setProfileFallbackRegion(null);
      resetMasterRegion();
      setCurrentRegionId(null);
      setUserRegions([]);
      return;
    }
    setUserRegions(getUserRegions(userId));
    setCurrentRegionId(null);
    /** 다른 계정의 대표 주소 잔존 금지 — 같은 viewer 면 첫 페인트 peek 유지 */
    setMasterRegion((prev) => (prev != null && prev.userId !== userId ? undefined : prev));
    let masterIdleId: number | null = null;
    if (isAppBootReady() && getAppBootSnapshot().status !== "anonymous" && !isStoreOwnerAdminPathname()) {
      masterIdleId = scheduleWhenBrowserIdle(() => {
        masterIdleId = null;
        void syncMasterRegion();
      }, 0);
    }
    const cancelMasterIdle = () => {
      if (masterIdleId != null) cancelScheduledWhenBrowserIdle(masterIdleId);
    };
    const boot = peekAppBootProfile();
    if (boot) {
      applyProfileSlice(boot as unknown as Record<string, unknown>);
      return cancelMasterIdle;
    }
    /** 허브 첫 페인트 — `APP_BOOT_READY` 전에 profile full 금지 */
    if (isStoreOwnerAdminPathname()) {
      return cancelMasterIdle;
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
        cancelMasterIdle();
      };
    }
    return () => {
      if (idleId != null) cancelScheduledWhenBrowserIdle(idleId);
      cancelMasterIdle();
    };
  }, [userId, refreshProfileLocation, applyProfileSlice, resetMasterRegion, syncMasterRegion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBoot = () => {
      if (getAppBootSnapshot().status === "anonymous") {
        setProfileFallbackRegion(null);
        resetMasterRegion();
        return;
      }
      const boot = peekAppBootProfile();
      if (boot) {
        applyProfileSlice(boot as unknown as Record<string, unknown>);
        if (!isStoreOwnerAdminPathname()) void syncMasterRegion();
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
  }, [refreshProfileLocation, applyProfileSlice, resetMasterRegion, syncMasterRegion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onAuthChanged = () => {
      if (getCurrentUser()?.id) return;
      setProfileFallbackRegion(null);
      resetMasterRegion();
      setCurrentRegionId(null);
      setUserRegions([]);
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
  }, [resetMasterRegion]);

  /** 주소 저장·대표 변경 — 대표 주소 City 강제 재조회 (ADDR-SSOT-002) */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onAddressesUpdated = () => {
      void syncMasterRegion({ force: true });
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [syncMasterRegion]);

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
    () =>
      userId === "guest"
        ? null
        : userRegions.find((r) => r.isPrimary) ?? userRegions[0] ?? null,
    [userRegions, userId]
  );

  /** 대표 주소(확정 전에는 프로필 City 폴백)가 있으면 mock 동네보다 우선 */
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

  /** 대표 주소·프로필 지역이 비면 해당 선택 상태만 mock 으로 복귀 */
  useEffect(() => {
    if (profileSourcedRegion) return;
    setCurrentRegionId((prev) => {
      if (prev !== PROFILE_LOCATION_REGION_ID && prev !== MASTER_ADDRESS_REGION_ID) return prev;
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
