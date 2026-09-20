"use client";

import { useEffect } from "react";
import { getAppBootSnapshot } from "@/lib/app-boot/app-boot-store";
import { APP_BOOT_PROFILE_UPDATED_EVENT, APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";

/**
 * Boot ready 후 address-defaults / marketplace hydrate 재시도.
 * - member: status ready + profile (기존)
 * - guest: status anonymous — Marketplace UNSET→ALL terminal retry (guest location HARD LOCK)
 * `shouldRetry` 가 false 면 이미 표시 줄이 있을 때 중복 fetch 를 막는다.
 */
export function useAddressDefaultsBootRetry(retry: () => void, shouldRetry: () => boolean): void {
  useEffect(() => {
    const onBoot = () => {
      const boot = getAppBootSnapshot();
      const memberReady = boot.status === "ready" && Boolean(boot.profile);
      const guestAnonymousReady = boot.status === "anonymous";
      if (!memberReady && !guestAnonymousReady) return;
      if (!shouldRetry()) return;
      retry();
    };
    window.addEventListener(APP_BOOT_READY_EVENT, onBoot);
    window.addEventListener(APP_BOOT_PROFILE_UPDATED_EVENT, onBoot);
    return () => {
      window.removeEventListener(APP_BOOT_READY_EVENT, onBoot);
      window.removeEventListener(APP_BOOT_PROFILE_UPDATED_EVENT, onBoot);
    };
  }, [retry, shouldRetry]);
}
