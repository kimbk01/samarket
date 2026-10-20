"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile/profile-update-events";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  fetchAddressDefaultsSnapshot,
  peekFreshAddressDefaultsSnapshot,
} from "@/lib/addresses/fetch-address-defaults-client";
import {
  clearMypageHomeCaches,
  peekMypageHomeSessionLite,
  type RequiredInfoStatus,
} from "@/lib/mypage/mypage-home-snapshot";
import {
  clearMypageHomeStore,
  getMypageHomeProjection,
  patchMypageHomeProjection,
  projectionFromProfile,
  projectionFromSessionLite,
  setMypageHomeProjection,
  subscribeMypageHomeStore,
  type MypageHomeProjection,
} from "@/lib/mypage/mypage-home-store";
import { resolveMypageHomeProfileResult } from "@/lib/mypage/resolve-mypage-home-profile";
import { formatUserAddressPublic } from "@/lib/addresses/user-address-display-ssot";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal } from "@/lib/runtime/dibay-myinfo-perf";
import { bumpMypageMountGeneration } from "@/lib/runtime/mypage-network-markers";
import { cancelPendingOwnerLiteAutoHydrate } from "@/lib/stores/owner-lite-external-store";

/**
 * Local user present but profile API failed — do not leave 「확인 중」 forever.
 * `needs_relogin` = 401/403 만. `error` = 5xx·네트워크 등 일시 장애 (기존 projection 유지 + 재시도).
 */
export type MypageHomeProfilePhase = "pending" | "ready" | "needs_relogin" | "error";

type AddressResolution = { status: RequiredInfoStatus; publicLabel: string | null };

function addressFromSnapshot(snap: AddressDefaultsSnapshot | null): AddressResolution {
  if (snap?.ok && snap.status === 200) {
    const master = snap.defaults?.master;
    if (master != null) {
      return {
        status: "complete",
        publicLabel: formatUserAddressPublic(master as UserAddressDTO)?.trim() || null,
      };
    }
    return { status: "required", publicLabel: null };
  }
  return { status: "unknown", publicLabel: null };
}

/**
 * Address status for root summary — one address-defaults read max.
 * 같은 응답에서 계정 그룹 「주소관리」 행 값(대표 동네 공개 라벨)도 만든다 — 추가 요청 0.
 * DO NOT: call mandatory-address-gate as a second address network on root.
 */
async function resolveAddressStatus(opts?: { force?: boolean }): Promise<AddressResolution> {
  const snap =
    opts?.force === true
      ? await fetchAddressDefaultsSnapshot({
          force: true,
          caller: "mypage_home_model",
          reason: "force_addresses_updated",
        })
      : peekFreshAddressDefaultsSnapshot() ??
        (await fetchAddressDefaultsSnapshot({
          caller: "mypage_home_model",
          reason: "initial_required_info_resolution",
        }));
  return addressFromSnapshot(snap);
}

function seedAddressStatusFromCache(): RequiredInfoStatus {
  const snap = peekFreshAddressDefaultsSnapshot();
  if (snap?.ok && snap.defaults?.master != null) return "complete";
  if (snap?.ok && snap.status === 200 && snap.defaults?.master == null) return "required";
  return "unknown";
}

/**
 * `/mypage` root only — profile + required-info status.
 * DO NOT: trade-counts / stores / order-counts / CMS.
 * DO NOT: lite+full parallel profile; DO NOT child address fetch hooks on root.
 */
export function useMypageHomeModel(enabled: boolean) {
  const projection = useSyncExternalStore(
    subscribeMypageHomeStore,
    getMypageHomeProjection,
    () => null,
  );
  const [profilePhase, setProfilePhase] = useState<MypageHomeProfilePhase>("pending");
  const refreshGenRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);
  const seededRef = useRef(false);

  const refresh = useCallback(async (opts?: { forceAddress?: boolean }) => {
    if (!enabled) return;
    const viewerId = getCurrentUser()?.id?.trim() ?? "";
    if (!viewerId) {
      clearMypageHomeStore();
      clearMypageHomeCaches();
      setProfilePhase("pending");
      return;
    }

    if (inflightRef.current && !opts?.forceAddress) {
      await inflightRef.current;
      return;
    }

    const gen = ++refreshGenRef.current;
    // 재시도 시 오류 카드 → 확인 중으로 전환
    setProfilePhase((prev) => (prev === "error" ? "pending" : prev));
    const run = (async () => {
      try {
        const [profileResult, address] = await Promise.all([
          resolveMypageHomeProfileResult(),
          resolveAddressStatus({ force: opts?.forceAddress === true }),
        ]);
        if (gen !== refreshGenRef.current) return;
        const currentViewer = getCurrentUser()?.id?.trim() ?? "";
        if (!currentViewer || currentViewer !== viewerId) return;
        if (!profileResult.ok) {
          if (profileResult.kind === "unauthenticated") {
            clearMypageHomeStore();
            // 401/403 — 실제 인증 실패만 재로그인
            setProfilePhase("needs_relogin");
            return;
          }
          // 5xx·네트워크 등 — 보이는 projection 유지, 재시도 UX
          setProfilePhase("error");
          return;
        }
        const profile = profileResult.profile;
        if (profile.id.trim() !== viewerId) {
          clearMypageHomeStore();
          setProfilePhase("needs_relogin");
          return;
        }
        setMypageHomeProjection({
          ...projectionFromProfile(profile, address.status),
          addressPublicLabel: address.publicLabel,
        });
        // 주소 조회 실패(unknown)면 확인 중 고착 대신 재시도 가능 상태
        setProfilePhase(address.status === "unknown" ? "error" : "ready");
      } catch {
        if (gen !== refreshGenRef.current) return;
        const currentViewer = getCurrentUser()?.id?.trim() ?? "";
        if (!currentViewer || currentViewer !== viewerId) return;
        // 네트워크 예외 — projection 은 지우지 않음
        setProfilePhase("error");
      } finally {
        if (inflightRef.current) inflightRef.current = null;
      }
    })();
    inflightRef.current = run;
    await run;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      seededRef.current = false;
      setProfilePhase("pending");
      return;
    }
    bumpMypageMountGeneration();
    cancelPendingOwnerLiteAutoHydrate("mypage_home_model_enabled");
    const viewerId = getCurrentUser()?.id?.trim() ?? "";
    if (!viewerId) return;

    if (!seededRef.current) {
      seededRef.current = true;
      const mem = getMypageHomeProjection();
      if (mem?.viewerId === viewerId) {
        setProfilePhase("ready");
      } else {
        const lite = peekMypageHomeSessionLite(viewerId);
        if (lite) {
          const addr =
            lite.addressStatus !== "unknown"
              ? lite.addressStatus
              : seedAddressStatusFromCache();
          setMypageHomeProjection({
            ...projectionFromSessionLite({ ...lite, addressStatus: addr }),
            addressStatus: addr,
            addressPublicLabel: addressFromSnapshot(peekFreshAddressDefaultsSnapshot()).publicLabel,
          });
          setProfilePhase("ready");
        } else {
          seedAddressStatusFromCache();
          setProfilePhase("pending");
        }
      }
    }

    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onProfile = () => {
      void refresh();
    };
    const onAddresses = () => {
      void refresh({ forceAddress: true });
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfile);
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddresses);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfile);
      window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddresses);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    const onAuthChanged = () => {
      seededRef.current = false;
      clearMypageHomeStore();
      clearMypageHomeCaches();
      setProfilePhase("pending");
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
  }, []);

  useEffect(() => {
    if (!projection?.profile) return;
    dibayMyInfoPerfMark("profile_card_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMark("menu_visible_ms", { surface: "mypage_root" });
    dibayMyInfoPerfMaybeLogTotal({ surface: "mypage_root" });
  }, [projection?.viewerId]);

  const applyProfilePatch = useCallback((profile: NonNullable<MypageHomeProjection["profile"]>) => {
    const addr = getMypageHomeProjection()?.addressStatus ?? "unknown";
    patchMypageHomeProjection({ profile, addressStatus: addr });
  }, []);

  return {
    projection,
    refresh,
    applyProfilePatch,
    hasSnapshot: Boolean(projection),
    profilePhase,
    needsRelogin: profilePhase === "needs_relogin",
    loadFailed: profilePhase === "error",
  };
}
