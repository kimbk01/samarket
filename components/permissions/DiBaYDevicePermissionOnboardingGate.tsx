"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { invalidateCallMediaPermissionCheckCache } from "@/lib/community-messenger/call-media-permission-preflight";
import {
  canAttemptPostLoginOnboardingGate,
  isPostLoginOnboardingBlockedByAddressGate,
  schedulePostLoginOnboardingOpen,
} from "@/lib/permissions/dibay-post-login-onboarding-gate";
import {
  resolveDibayUnifiedOnboardingPlan,
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

/**
 * 로그인 후 1회 — 단일 모달에서 알림 → 카메라 → 마이크 순으로 안내·요청.
 */
export function DiBaYDevicePermissionOnboardingGate() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const deferStoresHomeLcp = useStoresHomeOverlayDeferUntilInput();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<DibayUnifiedOnboardingStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [source, setSource] = useState<DibayDevicePermissionSource>("app_entry");
  const [requesting, setRequesting] = useState(false);
  const shownRef = useRef(false);
  const mountedRef = useRef(true);
  const stepIndexRef = useRef(0);
  const stepsRef = useRef<DibayUnifiedOnboardingStep[]>([]);
  const sourceRef = useRef<DibayDevicePermissionSource>("app_entry");
  const callMediaGrantedAtOpenRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  const currentStep = steps[stepIndex] ?? null;
  const totalSteps = steps.length;

  const closeWizard = useCallback(() => {
    if (!mountedRef.current) return;
    setOpen(false);
    setSteps([]);
    setStepIndex(0);
    setRequesting(false);
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

  const finalizeWizard = useCallback((options?: { skipMediaSync?: boolean }) => {
    if (options?.skipMediaSync) {
      invalidateCallMediaPermissionCheckCache();
    } else {
      syncCallMediaDecisionIfGranted();
    }
    closeWizard();
  }, [closeWizard, syncCallMediaDecisionIfGranted]);

  const advanceStep = useCallback(() => {
    setStepIndex((prev) => {
      const next = prev + 1;
      if (next >= stepsRef.current.length) {
        queueMicrotask(() => finalizeWizard());
        return prev;
      }
      return next;
    });
  }, [finalizeWizard]);

  const finishCallMediaFlow = useCallback(
    (decision: "accepted" | "declined" | "browser_denied") => {
      recordDiBaYOnboardingDecision("call_media", decision);
      finalizeWizard({ skipMediaSync: true });
    },
    [finalizeWizard],
  );

  const deferCallMediaOnboarding = useCallback(() => {
    markInitialDevicePermissionsDeferred(sourceRef.current);
    finishCallMediaFlow("declined");
  }, [finishCallMediaFlow]);

  const tryOpen = useCallback(() => {
    if (!canAttemptPostLoginOnboardingGate(pathname, deferStoresHomeLcp)) return;
    if (shownRef.current) return;

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
          console.info("[device-permission] unified_onboarding_show", {
            steps: plan.steps,
            source: plan.source,
          });
          setSource(plan.source);
          sourceRef.current = plan.source;
          setSteps(plan.steps);
          stepsRef.current = plan.steps;
          setStepIndex(0);
          stepIndexRef.current = 0;
          setOpen(true);
        })
        .catch((error) => {
          shownRef.current = false;
          if (process.env.NODE_ENV === "development") {
            console.warn("[DiBaYDevicePermissionOnboarding] plan failed", error);
          }
        });
    };
    schedulePostLoginOnboardingOpen(run);
  }, [deferStoresHomeLcp, pathname]);

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

  const onLater = () => {
    if (!currentStep || requesting) return;
    if (currentStep === "notification") {
      recordDiBaYOnboardingDecision("notification", "declined");
      advanceStep();
      return;
    }
    if (currentStep === "camera") {
      if (isLastWizardStep(stepIndexRef.current, stepsRef.current)) {
        deferCallMediaOnboarding();
      } else {
        advanceStep();
      }
      return;
    }
    if (currentStep === "microphone") {
      deferCallMediaOnboarding();
    }
  };

  const onAcceptNotification = () => {
    if (requesting) return;
    if (typeof window === "undefined" || !("Notification" in window)) {
      recordDiBaYOnboardingDecision("notification", "declined");
      advanceStep();
      return;
    }

    const existing = Notification.permission;
    if (existing === "granted") {
      recordDiBaYOnboardingDecision("notification", "accepted");
      schedulePushRegistration();
      advanceStep();
      return;
    }
    if (existing === "denied") {
      recordDiBaYOnboardingDecision("notification", "browser_denied");
      advanceStep();
      return;
    }

    setRequesting(true);
    void Notification.requestPermission()
      .then((permission) => {
        if (!mountedRef.current) return;
        const state =
          permission === "granted" ? "accepted" : permission === "denied" ? "browser_denied" : "declined";
        recordDiBaYOnboardingDecision("notification", state);
        if (permission === "granted") {
          schedulePushRegistration();
        }
        advanceStep();
      })
      .catch(() => {
        if (!mountedRef.current) return;
        recordDiBaYOnboardingDecision("notification", "declined");
        advanceStep();
      })
      .finally(() => {
        if (mountedRef.current) setRequesting(false);
      });
  };

  const onAcceptCamera = () => {
    if (requesting) return;
    setRequesting(true);
    void requestOnboardingCameraPermission(sourceRef.current)
      .then((state) => {
        if (!mountedRef.current) return;
        const isLast = isLastWizardStep(stepIndexRef.current, stepsRef.current);
        if (state.camera !== "granted") {
          if (isLast) {
            markInitialDevicePermissionsDeferred(sourceRef.current);
            finishCallMediaFlow(
              state.camera === "blocked" || state.camera === "denied" ? "browser_denied" : "declined",
            );
          } else {
            advanceStep();
          }
          return;
        }
        if (isLast) {
          if (state.microphone === "granted") {
            finishCallMediaFlow("accepted");
          } else {
            markInitialDevicePermissionsDeferred(sourceRef.current);
            finishCallMediaFlow("declined");
          }
          return;
        }
        advanceStep();
      })
      .catch(() => {
        if (!mountedRef.current) return;
        if (isLastWizardStep(stepIndexRef.current, stepsRef.current)) {
          deferCallMediaOnboarding();
        } else {
          advanceStep();
        }
      })
      .finally(() => {
        if (mountedRef.current) setRequesting(false);
      });
  };

  const onAcceptMicrophone = () => {
    if (requesting) return;
    setRequesting(true);
    void requestOnboardingMicrophonePermission(sourceRef.current)
      .then((state) => {
        if (!mountedRef.current) return;
        if (state.camera === "granted" && state.microphone === "granted") {
          finishCallMediaFlow("accepted");
          return;
        }
        markInitialDevicePermissionsDeferred(sourceRef.current);
        finishCallMediaFlow(
          state.microphone === "blocked" || state.microphone === "denied" ? "browser_denied" : "declined",
        );
      })
      .catch(() => {
        if (!mountedRef.current) return;
        deferCallMediaOnboarding();
      })
      .finally(() => {
        if (mountedRef.current) setRequesting(false);
      });
  };

  if (!open || !currentStep || totalSteps === 0) return null;

  const stepDots = (
    <div className="mb-3 flex justify-center gap-1.5" aria-hidden>
      {steps.map((step, i) => (
        <span
          key={`${step}-${i}`}
          className={`h-1.5 w-1.5 rounded-full ${i === stepIndex ? "bg-sam-ink" : i < stepIndex ? "bg-sam-muted" : "bg-sam-border"}`}
        />
      ))}
    </div>
  );

  let title = "";
  let body = "";
  let hint: string | null = null;
  let acceptLabel = "";
  let onAccept: () => void = () => {};

  if (currentStep === "notification") {
    title = t("dibay_notif_prompt_title");
    body = t("dibay_notif_prompt_body");
    hint = t("dibay_notif_prompt_marketing_hint");
    acceptLabel = t("dibay_notif_accept");
    onAccept = onAcceptNotification;
  } else if (currentStep === "camera") {
    title = t("dibay_device_onboard_camera_title");
    body = t("dibay_device_onboard_camera_body");
    acceptLabel = t("dibay_device_onboard_camera_accept");
    onAccept = onAcceptCamera;
  } else {
    title = t("dibay_device_onboard_mic_title");
    body = t("dibay_device_onboard_mic_body");
    acceptLabel = t("dibay_device_onboard_mic_accept");
    onAccept = onAcceptMicrophone;
  }

  const laterLabel =
    currentStep === "notification"
      ? t("dibay_notif_later")
      : currentStep === "camera"
        ? t("dibay_device_onboard_camera_later")
        : t("dibay_device_onboard_mic_later");

  return (
    <div
      className="fixed inset-0 z-[126] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dibay-device-onboard-title"
    >
      <div className="w-full max-w-sm rounded-ui-rect bg-sam-surface p-5 shadow-xl">
        {stepDots}
        <p id="dibay-device-onboard-title" className="sam-text-body font-semibold text-sam-fg">
          {title}
        </p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">{body}</p>
        {hint ? (
          <p className="mt-3 text-[11px] leading-snug text-sam-muted">{hint}</p>
        ) : null}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onLater}
            disabled={requesting}
            className="flex-1 rounded-ui-rect border border-sam-border py-2.5 sam-text-body font-medium text-sam-fg"
          >
            {laterLabel}
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={requesting}
            className="flex-1 rounded-ui-rect bg-sam-ink py-2.5 sam-text-body font-medium text-white disabled:opacity-60"
          >
            {requesting ? t("cm_ui_check_permission") : acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
