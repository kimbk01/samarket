"use client";

import { useEffect } from "react";
import { getAppBootSnapshot } from "@/lib/app-boot/app-boot-store";
import { APP_BOOT_PROFILE_UPDATED_EVENT, APP_BOOT_READY_EVENT } from "@/lib/app-boot/app-boot-types";

/**
 * 로그인 부트 완료 후 address-defaults 재조회 — 초기 401·네트워크 실패 후 주소 줄 복구.
 * `shouldRetry` 가 false 면 이미 표시 줄이 있을 때 중복 fetch 를 막는다.
 */
export function useAddressDefaultsBootRetry(retry: () => void, shouldRetry: () => boolean): void {
  useEffect(() => {
    const onBoot = () => {
      const boot = getAppBootSnapshot();
      if (boot.status !== "ready" || !boot.profile) return;
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
