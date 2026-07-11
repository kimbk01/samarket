"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  canAttemptPostLoginOnboardingGate,
  DIBAY_POST_LOGIN_ONBOARDING_PROFILE_RETRY_EVENT,
  isPostLoginOnboardingBlockedByAddressGate,
  isPostLoginOnboardingPathEligible,
  notifyPostLoginOnboardingProfileRetry,
  schedulePostLoginOnboardingOpen,
} from "@/lib/permissions/dibay-post-login-onboarding-gate";
import { syncNotificationState } from "@/lib/permissions/permission-manager/notification-permission-manager";
import { subscribeDibayAuthStateChange } from "@/lib/auth/dibay-session-manager";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

/** 로그인 후 notification OS flow 완료 전 NativePushRegistration 대기용 */
let notificationOnboardingSettled = false;
let notificationOnboardingWaiters: Array<() => void> = [];

export function markNotificationOnboardingSettled(): void {
  notificationOnboardingSettled = true;
  const waiters = notificationOnboardingWaiters;
  notificationOnboardingWaiters = [];
  for (const fn of waiters) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function isNotificationOnboardingSettled(): boolean {
  return notificationOnboardingSettled;
}

export function waitForNotificationOnboardingSettled(): Promise<void> {
  if (notificationOnboardingSettled) return Promise.resolve();
  return new Promise((resolve) => {
    notificationOnboardingWaiters.push(resolve);
  });
}

/**
 * 로그인 후 — OS 알림 상태 sync만 수행. 자동 OS 권한 요청·설정 이동 없음.
 */
export function DiBaYDevicePermissionOnboardingGate() {
  const pathname = usePathname() ?? "";
  const deferStoresHomeLcp = useStoresHomeOverlayDeferUntilInput();
  const shownRef = useRef(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runPostLoginSync = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      await syncNotificationState();
    } finally {
      runningRef.current = false;
      markNotificationOnboardingSettled();
    }
  }, []);

  const tryOpen = useCallback(() => {
    if (!isPostLoginOnboardingPathEligible(pathname, deferStoresHomeLcp)) return;
    if (!canAttemptPostLoginOnboardingGate(pathname, deferStoresHomeLcp)) return;
    if (shownRef.current || runningRef.current) return;

    const run = () => {
      void isPostLoginOnboardingBlockedByAddressGate()
        .then((needsBlock) => {
          if (needsBlock) {
            markNotificationOnboardingSettled();
            return;
          }
          if (!mountedRef.current) {
            markNotificationOnboardingSettled();
            return;
          }
          shownRef.current = true;
          return runPostLoginSync();
        })
        .catch((error) => {
          shownRef.current = false;
          runningRef.current = false;
          markNotificationOnboardingSettled();
          if (process.env.NODE_ENV === "development") {
            console.warn("[DiBaYDevicePermissionOnboarding] sync failed", error);
          }
        });
    };
    schedulePostLoginOnboardingOpen(run);
  }, [deferStoresHomeLcp, pathname, runPostLoginSync]);

  useEffect(() => {
    const timer = window.setTimeout(() => tryOpen(), 300);
    return () => window.clearTimeout(timer);
  }, [tryOpen]);

  useEffect(() => {
    return subscribeDibayAuthStateChange((event, session) => {
      if (!session?.user?.id) return;
      if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return;
      notifyPostLoginOnboardingProfileRetry();
      tryOpen();
    });
  }, [tryOpen]);

  useEffect(() => {
    const onProfileRetry = () => {
      tryOpen();
    };
    window.addEventListener(DIBAY_POST_LOGIN_ONBOARDING_PROFILE_RETRY_EVENT, onProfileRetry);
    return () => window.removeEventListener(DIBAY_POST_LOGIN_ONBOARDING_PROFILE_RETRY_EVENT, onProfileRetry);
  }, [tryOpen]);

  useEffect(() => {
    const onAddressesUpdated = () => {
      shownRef.current = false;
      tryOpen();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [tryOpen]);

  return null;
}
