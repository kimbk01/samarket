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
import {
  canAttemptPostLoginOnboardingGate,
  DIBAY_POST_LOGIN_ONBOARDING_PROFILE_RETRY_EVENT,
  isPostLoginOnboardingBlockedByAddressGate,
  isPostLoginOnboardingPathEligible,
  notifyPostLoginOnboardingProfileRetry,
  resolvePostLoginOnboardingUserId,
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
import { runNotificationGuideFlow } from "@/lib/permissions/permission-manager/notification-onboarding-flow";
import { syncNotificationState } from "@/lib/permissions/permission-manager/notification-permission-manager";
import { subscribeDibayAuthStateChange } from "@/lib/auth/dibay-session-manager";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

/** 로그인 후 notification guide 완료 전 NativePushRegistration 대기용 */
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
 * 로그인 후 1회 — Notification Guide → OS 허용 → Push Register, 이후 CallPermissionModal.
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
      markNotificationOnboardingSettled();
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
    markNotificationOnboardingSettled();
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
        await syncNotificationState();

        for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
          if (!mountedRef.current) return;

          const step = steps[stepIndex];
          if (step === "notification") {
            await runNotificationGuideFlow("first_login");
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
          markNotificationOnboardingSettled();
        }
      }
    },
    [runCallMediaModalStep, syncCallMediaDecisionIfGranted],
  );

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
          callMediaGrantedAtOpenRef.current = plan.callMediaAlreadyGranted;

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

  return showCallPermissionModal ? (
    <CallPermissionModal
      mode="onboarding"
      onConfirm={() => void handleCallPermissionConfirm()}
      onDecline={handleCallPermissionDecline}
      onOpenSettings={() => void openNativeCallPermissionSettings()}
    />
  ) : null;
}
