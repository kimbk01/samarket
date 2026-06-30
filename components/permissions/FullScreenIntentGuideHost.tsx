"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  isNotificationOnboardingSettled,
  waitForNotificationOnboardingSettled,
} from "@/components/permissions/DiBaYDevicePermissionOnboardingGate";
import {
  getFullScreenIntentGuidePending,
  settleFullScreenIntentGuideSheet,
  subscribeFullScreenIntentGuideBridge,
} from "@/lib/permissions/permission-manager/full-screen-intent-guide-bridge";
import {
  dismissFullScreenIntentGuideIfGranted,
  isAndroidFullScreenIntentGuidePlatform,
  runLoginFullScreenIntentGuideIfNeeded,
  shouldShowLoginFullScreenIntentGuide,
  syncFullScreenIntentAfterAppResume,
} from "@/lib/permissions/permission-manager/full-screen-intent-guide-flow";
import { isFsiPermanentDismiss, isFsiSessionLater } from "@/lib/permissions/permission-manager/full-screen-intent-guide-storage";
import { syncNotificationState } from "@/lib/permissions/permission-manager/notification-permission-manager";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { subscribeDibayAuthStateChange } from "@/lib/auth/dibay-session-manager";

/**
 * Android FSI-only in-app guide — routes to OS settings; not a substitute for OS permission UI.
 */
export function FullScreenIntentGuideHost() {
  const { safeT } = useI18n();
  const [, bump] = useReducer((x) => x + 1, 0);
  const loginAttemptedRef = useRef(false);
  const resumeSyncRef = useRef(false);

  useEffect(() => subscribeFullScreenIntentGuideBridge(bump), []);

  const tryLoginGuide = useCallback(async () => {
    if (!isAndroidFullScreenIntentGuidePlatform()) return;
    if (loginAttemptedRef.current) return;
    await waitForNotificationOnboardingSettled();
    if (!isNotificationOnboardingSettled()) return;

    const snapshot = await syncNotificationState();
    if (snapshot.fullScreenIntentEnabled || isFsiSessionLater() || isFsiPermanentDismiss()) {
      loginAttemptedRef.current = true;
      return;
    }
    if (!shouldShowLoginFullScreenIntentGuide(snapshot)) return;

    loginAttemptedRef.current = true;
    await runLoginFullScreenIntentGuideIfNeeded({ notificationOnboardingSettled: true });
  }, []);

  const onAppResume = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (resumeSyncRef.current) return;
    resumeSyncRef.current = true;
    void syncFullScreenIntentAfterAppResume()
      .then((snapshot) => {
        dismissFullScreenIntentGuideIfGranted(snapshot.fullScreenIntentEnabled);
      })
      .catch(() => {})
      .finally(() => {
        resumeSyncRef.current = false;
        bump();
      });
  }, []);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    void tryLoginGuide();

    const unsubAuth = subscribeDibayAuthStateChange((event, session) => {
      if (!session?.user?.id) return;
      if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return;
      loginAttemptedRef.current = false;
      void tryLoginGuide();
    });

    document.addEventListener("visibilitychange", onAppResume);

    let appStateHandle: { remove: () => void } | null = null;
    void import("@capacitor/app").then(({ App }) =>
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) onAppResume();
      }).then((handle) => {
        appStateHandle = handle;
      }),
    );

    return () => {
      unsubAuth();
      document.removeEventListener("visibilitychange", onAppResume);
      appStateHandle?.remove();
    };
  }, [onAppResume, tryLoginGuide]);

  if (!isAndroidFullScreenIntentGuidePlatform()) {
    return null;
  }

  const pending = getFullScreenIntentGuidePending();
  if (!pending) return null;

  const showPermanentDismiss = pending.context === "login";

  return (
    <div
      className="fixed inset-0 z-[127] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dibay-fsi-guide-title"
      aria-describedby="dibay-fsi-guide-hint"
    >
      <div className="w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-5 shadow-xl">
        <p id="dibay-fsi-guide-title" className={`${Sam.text.bodySecondary} leading-relaxed text-sam-fg`}>
          {safeT("dibay_fsi_guide_body", {
            fallbackKo: "잠금화면에서 통화를 받으려면 기기의 전체화면 알림 허용이 필요합니다.",
            fallbackEn: "To receive calls on the lock screen, allow full-screen notifications on your device.",
          })}
        </p>
        <p id="dibay-fsi-guide-hint" className={`mt-2 ${Sam.text.helper} text-sam-muted`}>
          {safeT("dibay_fsi_guide_settings_hint", {
            fallbackKo: "아래 버튼을 누르면 기기 설정 화면으로 이동합니다.",
            fallbackEn: "The button below opens your device settings.",
          })}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} min-h-[44px]`}
            onClick={() => settleFullScreenIntentGuideSheet("open_settings")}
          >
            {safeT("dibay_fsi_guide_open_settings", {
              fallbackKo: "기기 설정 열기",
              fallbackEn: "Open device settings",
            })}
          </button>
          <button
            type="button"
            className={`${Sam.btn.ghostCombo} ${Sam.btn.block} min-h-[44px]`}
            onClick={() => settleFullScreenIntentGuideSheet("later")}
          >
            {safeT("dibay_fsi_guide_later", {
              fallbackKo: "나중에",
              fallbackEn: "Not now",
            })}
          </button>
          {showPermanentDismiss ? (
            <button
              type="button"
              className={`${Sam.btn.ghostCombo} ${Sam.btn.block} min-h-[40px] text-sam-muted`}
              onClick={() => settleFullScreenIntentGuideSheet("dismiss_permanent")}
            >
              {safeT("dibay_fsi_guide_dismiss_permanent", {
                fallbackKo: "다시 보지 않기",
                fallbackEn: "Don't show again",
              })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
