"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile/profile-update-events";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  fetchAddressDefaultsSnapshot,
  peekFreshAddressDefaultsSnapshot,
} from "@/lib/addresses/fetch-address-defaults-client";
import {
  invalidateMandatoryAddressGateClientCache,
  readMandatoryAddressGateNeedsBlock,
} from "@/lib/addresses/mandatory-address-gate-client";
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
import { dibayMyInfoPerfMark, dibayMyInfoPerfMaybeLogTotal } from "@/lib/runtime/dibay-myinfo-perf";

async function resolveAddressStatus(): Promise<RequiredInfoStatus> {
  const snap = peekFreshAddressDefaultsSnapshot();
  if (snap?.ok && snap.defaults?.master != null) return "complete";
  try {
    const needsBlock = await readMandatoryAddressGateNeedsBlock();
    return needsBlock ? "required" : "complete";
  } catch {
    return "unknown";
  }
}

function seedAddressStatusFromCache(): RequiredInfoStatus {
  const snap = peekFreshAddressDefaultsSnapshot();
  if (snap?.ok && snap.defaults?.master != null) return "complete";
  return "unknown";
}

/**
 * `/mypage` root only — profile + required-info status.
 * DO NOT: trade-counts / stores / order-counts / CMS.
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
        if (opts?.forceAddress) {
          invalidateMandatoryAddressGateClientCache();
          await fetchAddressDefaultsSnapshot({ force: true });
        }
        const [profile, addressStatus] = await Promise.all([
          getMyProfile(),
          resolveAddressStatus(),
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
          const addr = seedAddressStatusFromCache();
          /* no snapshot — stay null until refresh; UI shows mini skeleton */
          if (addr === "complete") {
            /* keep unknown phone/id until profile arrives */
          }
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
