"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { invalidateCallMediaPermissionCheckCache } from "@/lib/community-messenger/call-media-permission-preflight";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  canAttemptPostLoginOnboardingGate,
  isPostLoginOnboardingBlockedByAddressGate,
  schedulePostLoginOnboardingOpen,
} from "@/lib/permissions/dibay-post-login-onboarding-gate";
import {
  resolveDibayUnifiedOnboardingPlan,
  type DibayUnifiedOnboardingPlan,
  type DibayUnifiedOnboardingStep,
} from "@/lib/permissions/dibay-unified-device-onboarding";
import {
  checkDevicePermissions,
  markInitialDevicePermissionsDeferred,
  requestOnboardingCameraPermission,
  requestOnboardingMicrophonePermission,
  type DibayDevicePermissionSource,
} from "@/lib/permissions/dibay-device-permission-store";
import { recordDiBaYOnboardingDecision } from "@/lib/permissions/device-permission-manager";
import { requestNativeNotificationPermissionIfNeeded } from "@/lib/push/native/check-native-notification-permission";
import { registerWebPushSubscriptionFromClient } from "@/lib/push/register-web-push-subscription-client";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

function schedulePushRegistration(): void {
  void registerWebPushSubscriptionFromClient().then((reg) => {
    if (!reg.ok && process.env.NODE_ENV === "development") {
      console.info("[DiBaYDevicePermissionOnboarding] push register", reg);
    }
  });
}

function isLastWizardStep(stepIndex: number, steps: DibayUnifiedOnboardingStep[]): boolean {
  return stepIndex + 1 >= steps.length;
}

async function runNotificationOsPermissionStep(): Promise<void> {
  if (typeof window === "undefined") {
    recordDiBaYOnboardingDecision("notification", "declined");
    return;
  }

  if (isCapacitorNativePlatform()) {
    const permission = await requestNativeNotificationPermissionIfNeeded();
    const state =
      permission === "granted" ? "accepted" : permission === "denied" ? "browser_denied" : "declined";
    recordDiBaYOnboardingDecision("notification", state);
    if (permission === "granted") {
      schedulePushRegistration();
    }
    return;
  }

  if (!("Notification" in window)) {
    recordDiBaYOnboardingDecision("notification", "declined");
    return;
  }

  const existing = Notification.permission;
  if (existing === "granted") {
    recordDiBaYOnboardingDecision("notification", "accepted");
    schedulePushRegistration();
    return;
  }
  if (existing === "denied") {
    recordDiBaYOnboardingDecision("notification", "browser_denied");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    const state =
      permission === "granted" ? "accepted" : permission === "denied" ? "browser_denied" : "declined";
    recordDiBaYOnboardingDecision("notification", state);
    if (permission === "granted") {
      schedulePushRegistration();
    }
  } catch {
    recordDiBaYOnboardingDecision("notification", "declined");
  }
}

/**
 * 로그인 후 1회 — 알림 → 카메라 → 마이크 순으로 OS 권한 다이얼로그만 순차 요청 (커스텀 사전 안내 없음).
 */
export function DiBaYDevicePermissionOnboardingGate() {
  const pathname = usePathname() ?? "";
  const deferStoresHomeLcp = useStoresHomeOverlayDeferUntilInput();
  const shownRef = useRef(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const callMediaGrantedAtOpenRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const syncCallMediaDecisionIfGranted = useCallback(() => {
    void checkDevicePermissions()
      .then((state) => {
        if (state.camera === "granted" && state.microphone === "granted") {
          recordDiBaYOnboardingDecision("call_media", "accepted");
        } else if (callMediaGrantedAtOpenRef.current) {
          recordDiBaYOnboardingDecision("call_media", "accepted");
        }
        invalidateCallMediaPermissionCheckCache();
      })
      .catch(() => {
        invalidateCallMediaPermissionCheckCache();
      });
  }, []);

  const finishCallMediaFlow = useCallback((decision: "accepted" | "declined" | "browser_denied") => {
    recordDiBaYOnboardingDecision("call_media", decision);
    invalidateCallMediaPermissionCheckCache();
  }, []);

  const deferCallMediaOnboarding = useCallback(
    (source: DibayDevicePermissionSource) => {
      markInitialDevicePermissionsDeferred(source);
      finishCallMediaFlow("declined");
    },
    [finishCallMediaFlow],
  );

  const runCameraOsPermissionStep = useCallback(
    async (
      source: DibayDevicePermissionSource,
      stepIndex: number,
      steps: DibayUnifiedOnboardingStep[],
    ): Promise<boolean> => {
      try {
        const state = await requestOnboardingCameraPermission(source);
        if (!mountedRef.current) return false;

        const isLast = isLastWizardStep(stepIndex, steps);
        if (state.camera !== "granted") {
          if (isLast) {
            markInitialDevicePermissionsDeferred(source);
            finishCallMediaFlow(
              state.camera === "blocked" || state.camera === "denied" ? "browser_denied" : "declined",
            );
            return false;
          }
          return true;
        }

        if (isLast) {
          if (state.microphone === "granted") {
            finishCallMediaFlow("accepted");
          } else {
            markInitialDevicePermissionsDeferred(source);
            finishCallMediaFlow("declined");
          }
          return false;
        }
        return true;
      } catch {
        if (!mountedRef.current) return false;
        if (isLastWizardStep(stepIndex, steps)) {
          deferCallMediaOnboarding(source);
        }
        return isLastWizardStep(stepIndex, steps) ? false : true;
      }
    },
    [deferCallMediaOnboarding, finishCallMediaFlow],
  );

  const runMicrophoneOsPermissionStep = useCallback(
    async (source: DibayDevicePermissionSource): Promise<void> => {
      try {
        const state = await requestOnboardingMicrophonePermission(source);
        if (!mountedRef.current) return;

        if (state.camera === "granted" && state.microphone === "granted") {
          finishCallMediaFlow("accepted");
          return;
        }
        markInitialDevicePermissionsDeferred(source);
        finishCallMediaFlow(
          state.microphone === "blocked" || state.microphone === "denied" ? "browser_denied" : "declined",
        );
      } catch {
        if (!mountedRef.current) return;
        deferCallMediaOnboarding(source);
      }
    },
    [deferCallMediaOnboarding, finishCallMediaFlow],
  );

  const runOsPermissionSequence = useCallback(
    async (plan: DibayUnifiedOnboardingPlan) => {
      if (runningRef.current) return;
      runningRef.current = true;

      const { steps, source } = plan;
      console.info("[device-permission] unified_onboarding_os_sequence", {
        steps,
        source,
      });

      try {
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
          if (!mountedRef.current) return;

          const step = steps[stepIndex];
          if (step === "notification") {
            await runNotificationOsPermissionStep();
            continue;
          }

          if (step === "camera") {
            const shouldContinue = await runCameraOsPermissionStep(source, stepIndex, steps);
            if (!shouldContinue) return;
            continue;
          }

          if (step === "microphone") {
            await runMicrophoneOsPermissionStep(source);
            return;
          }
        }

        if (mountedRef.current) {
          syncCallMediaDecisionIfGranted();
        }
      } finally {
        runningRef.current = false;
      }
    },
    [runCameraOsPermissionStep, runMicrophoneOsPermissionStep, syncCallMediaDecisionIfGranted],
  );

  const tryOpen = useCallback(() => {
    if (!canAttemptPostLoginOnboardingGate(pathname, deferStoresHomeLcp)) return;
    if (shownRef.current || runningRef.current) return;

    const run = () => {
      void isPostLoginOnboardingBlockedByAddressGate()
        .then((needsBlock) => {
          if (needsBlock) return;
          return resolveDibayUnifiedOnboardingPlan();
        })
        .then((plan) => {
          if (!plan || !mountedRef.current) return;
          callMediaGrantedAtOpenRef.current = plan.callMediaAlreadyGranted;

          if (plan.callMediaAlreadyGranted && plan.steps.length === 0) {
            recordDiBaYOnboardingDecision("call_media", "accepted");
            return;
          }
          if (plan.steps.length === 0) return;

          shownRef.current = true;
          return runOsPermissionSequence(plan);
        })
        .catch((error) => {
          shownRef.current = false;
          runningRef.current = false;
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
    const onAddressesUpdated = () => {
      shownRef.current = false;
      tryOpen();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [tryOpen]);

  return null;
}
