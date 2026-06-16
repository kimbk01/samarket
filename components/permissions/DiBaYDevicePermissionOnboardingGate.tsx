"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CallPermissionModal } from "@/components/call/CallPermissionModal";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { invalidateCallMediaPermissionCheckCache } from "@/lib/community-messenger/call-media-permission-preflight";
import { callPermissionGate } from "@/lib/call/permissions/call-permission-gate";
import {
  markCallPermissionOnboardingShown,
  writeCallPermissionStoreState,
} from "@/lib/call/permissions/call-permission-store";
import { openNativeCallPermissionSettings } from "@/lib/call/native/native-call-permissions";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  canAttemptPostLoginOnboardingGate,
  isPostLoginOnboardingBlockedByAddressGate,
  schedulePostLoginOnboardingOpen,
} from "@/lib/permissions/dibay-post-login-onboarding-gate";
import {
  resolveDibayUnifiedOnboardingPlan,
  type DibayUnifiedOnboardingPlan,
} from "@/lib/permissions/dibay-unified-device-onboarding";
import {
  checkDevicePermissions,
  markInitialDevicePermissionsDeferred,
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
 * 로그인 후 1회 — 알림 OS 권한 후 CallPermissionModal 로 통화 권한 안내 (강제 차단 없음).
 */
export function DiBaYDevicePermissionOnboardingGate() {
  const pathname = usePathname() ?? "";
  const deferStoresHomeLcp = useStoresHomeOverlayDeferUntilInput();
  const shownRef = useRef(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const callMediaGrantedAtOpenRef = useRef(false);
  const [showCallPermissionModal, setShowCallPermissionModal] = useState(false);
  const pendingMediaSourceRef = useRef<DibayDevicePermissionSource | null>(null);

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

  const runCallMediaModalStep = useCallback(
    (source: DibayDevicePermissionSource) => {
      pendingMediaSourceRef.current = source;
      markCallPermissionOnboardingShown();
      setShowCallPermissionModal(true);
    },
    [],
  );

  const handleCallPermissionConfirm = useCallback(async () => {
    setShowCallPermissionModal(false);
    const source = pendingMediaSourceRef.current;
    try {
      await callPermissionGate.prompt("video", "onboarding");
      const check = await callPermissionGate.check("video");
      if (check.canVideo || check.canVoice) {
        finishCallMediaFlow("accepted");
      } else {
        writeCallPermissionStoreState(check.effectiveState === "denied_permanently" ? "denied_permanently" : "denied_once");
        if (source) markInitialDevicePermissionsDeferred(source);
        finishCallMediaFlow("declined");
      }
    } catch {
      writeCallPermissionStoreState("denied_once");
      if (source) markInitialDevicePermissionsDeferred(source);
      finishCallMediaFlow("declined");
    } finally {
      pendingMediaSourceRef.current = null;
      runningRef.current = false;
    }
  }, [finishCallMediaFlow]);

  const handleCallPermissionDecline = useCallback(() => {
    setShowCallPermissionModal(false);
    const source = pendingMediaSourceRef.current;
    writeCallPermissionStoreState("denied_once");
    if (source) markInitialDevicePermissionsDeferred(source);
    finishCallMediaFlow("declined");
    pendingMediaSourceRef.current = null;
    runningRef.current = false;
  }, [finishCallMediaFlow]);

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

          if (step === "camera" || step === "microphone") {
            runCallMediaModalStep(source);
            return;
          }
        }

        if (mountedRef.current) {
          syncCallMediaDecisionIfGranted();
        }
      } finally {
        if (!pendingMediaSourceRef.current) {
          runningRef.current = false;
        }
      }
    },
    [runCallMediaModalStep, syncCallMediaDecisionIfGranted],
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

  return showCallPermissionModal ? (
    <CallPermissionModal
      mode="onboarding"
      onConfirm={() => void handleCallPermissionConfirm()}
      onDecline={handleCallPermissionDecline}
      onOpenSettings={() => void openNativeCallPermissionSettings()}
    />
  ) : null;
}
