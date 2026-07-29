"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
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
import { resolveMypageHomeProfileRow } from "@/lib/mypage/resolve-mypage-home-profile";
import { dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal } from "@/lib/runtime/dibay-myinfo-perf";

/**
 * Address status for root summary — one address-defaults read max.
 * DO NOT: call mandatory-address-gate as a second address network on root.
 */
async function resolveAddressStatus(opts?: { force?: boolean }): Promise<RequiredInfoStatus> {
  const snap =
    opts?.force === true
      ? await fetchAddressDefaultsSnapshot({ force: true })
      : peekFreshAddressDefaultsSnapshot() ?? (await fetchAddressDefaultsSnapshot());
  if (snap?.ok && snap.status === 200) {
    return snap.defaults?.master != null ? "complete" : "required";
  }
  return "unknown";
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
  const refreshGenRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);
  const seededRef = useRef(false);

  const refresh = useCallback(async (opts?: { forceAddress?: boolean }) => {
    if (!enabled) return;
    const viewerId = getCurrentUser()?.id?.trim() ?? "";
    if (!viewerId) {
      clearMypageHomeStore();
      clearMypageHomeCaches();
      return;
    }

    if (inflightRef.current && !opts?.forceAddress) {
      await inflightRef.current;
      return;
    }

    const gen = ++refreshGenRef.current;
    const run = (async () => {
      try {
        const [profile, addressStatus] = await Promise.all([
          resolveMypageHomeProfileRow(),
          resolveAddressStatus({ force: opts?.forceAddress === true }),
        ]);
        if (gen !== refreshGenRef.current) return;
        const currentViewer = getCurrentUser()?.id?.trim() ?? "";
        if (!currentViewer || currentViewer !== viewerId) return;
        if (!profile?.id?.trim()) {
          clearMypageHomeStore();
          return;
        }
        if (profile.id.trim() !== viewerId) return;
        setMypageHomeProjection(projectionFromProfile(profile, addressStatus));
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
      return;
    }
    const viewerId = getCurrentUser()?.id?.trim() ?? "";
    if (!viewerId) return;

    if (!seededRef.current) {
      seededRef.current = true;
      const mem = getMypageHomeProjection();
      if (mem?.viewerId === viewerId) {
        /* memory hit — paint already */
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
          });
        } else {
          seedAddressStatusFromCache();
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
  };
}
