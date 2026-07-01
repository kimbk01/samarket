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
import {
  resolveDibayUnifiedOnboardingPlan,
  type DibayUnifiedOnboardingPlan,
} from "@/lib/permissions/dibay-unified-device-onboarding";
import { recordDiBaYOnboardingDecision } from "@/lib/permissions/device-permission-manager";
import { runNotificationGuideFlow } from "@/lib/permissions/permission-manager/notification-onboarding-flow";
import { runPostLoginFullScreenIntentCheck } from "@/lib/permissions/permission-manager/post-login-full-screen-intent-check";
import { syncNotificationState } from "@/lib/permissions/permission-manager/notification-permission-manager";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
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
 * 로그인 후 1회 — OS 알림 + FSI(Android) 상태 확인. mic/camera/battery는 통화 gesture 시만.
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

  const runOsPermissionSequence = useCallback(async (plan: DibayUnifiedOnboardingPlan) => {
    if (runningRef.current) return;
    runningRef.current = true;

    const { steps } = plan;
    console.info("[device-permission] unified_onboarding_os_sequence", { steps, source: plan.source });

    try {
      await syncNotificationState();

      for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
        if (!mountedRef.current) return;

        const step = steps[stepIndex];
        if (step === "notification" && isCapacitorNativePlatform()) {
          await runNotificationGuideFlow("first_login");
        }
        if (step === "full_screen_intent") {
          await runPostLoginFullScreenIntentCheck();
        }
      }
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
            return null;
          }
          return resolveDibayUnifiedOnboardingPlan();
        })
        .then((plan) => {
          if (!plan || !mountedRef.current) {
            markNotificationOnboardingSettled();
            return;
          }

          if (plan.callMediaAlreadyGranted && plan.steps.length === 0) {
            recordDiBaYOnboardingDecision("call_media", "accepted");
            markNotificationOnboardingSettled();
            return;
          }
          if (plan.steps.length === 0) {
            markNotificationOnboardingSettled();
            return;
          }

          shownRef.current = true;
          return runOsPermissionSequence(plan);
        })
        .catch((error) => {
          shownRef.current = false;
          runningRef.current = false;
          markNotificationOnboardingSettled();
          if (process.env.NODE_ENV === "development") {
            console.warn("[DiBaYDevicePermissionOnboarding] plan failed", error);
          }
        });
    };
    schedulePostLoginOnboardingOpen(run);
  }, [deferStoresHomeLcp, pathname, runOsPermissionSequence]);

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
