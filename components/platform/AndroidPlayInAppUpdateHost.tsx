"use client";

import { useEffect, useState } from "react";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import { addAndroidFlexibleDownloadedListener } from "@/lib/platform/android-play-in-app-update";
import {
  runAndroidPlayInAppUpdateCheck,
  subscribeAndroidFlexibleInstallReady,
} from "@/lib/platform/android-play-in-app-update-orchestrator";

/**
 * Android-only Play In-App Updates host.
 * Cold start + resume check (FLEXIBLE default). Never mounts Play UI during calls
 * (native plugin rejects call_in_progress). Flexible install requires explicit confirm.
 */
export function AndroidPlayInAppUpdateHost() {
  const { safeT } = useI18n();
  const [installReadyOpen, setInstallReadyOpen] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;
    if (resolveCapacitorShellPlatform() !== "android") return;

    let cancelled = false;
    const openInstallReady = () => {
      if (!cancelled) setInstallReadyOpen(true);
    };

    const unsubLocal = subscribeAndroidFlexibleInstallReady(openInstallReady);
    let removeNative: (() => void) | undefined;
    let removeAppState: (() => void) | undefined;

    void (async () => {
      const nativeHandle = await addAndroidFlexibleDownloadedListener(openInstallReady);
      if (cancelled) {
        void nativeHandle?.remove();
        return;
      }
      removeNative = () => {
        void nativeHandle?.remove();
      };

      // Cold start: delay past intro/auth/call hydrate so we do not steal focus.
      window.setTimeout(() => {
        if (!cancelled) void runAndroidPlayInAppUpdateCheck();
      }, 8_000);

      const { App } = await import("@capacitor/app");
      const appStateHandle = await App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive || cancelled) return;
        void runAndroidPlayInAppUpdateCheck();
      });
      removeAppState = () => {
        void appStateHandle.remove();
      };
    })();

    return () => {
      cancelled = true;
      unsubLocal();
      removeNative?.();
      removeAppState?.();
    };
  }, []);

  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") {
    return null;
  }

  return (
    <DibayConfirmDialog
      open={installReadyOpen}
      blocking={false}
      busy={installBusy}
      title={safeT("settings_version_install_ready_title", {
        fallbackKo: "업데이트가 준비되었습니다",
        fallbackEn: "Update ready to install",
      })}
      description={safeT("settings_version_install_ready_desc", {
        fallbackKo: "다운로드가 완료되었습니다. 지금 설치하면 앱이 다시 시작됩니다.",
        fallbackEn: "Download finished. Installing now will restart the app.",
      })}
      cancelLabel={safeT("settings_version_install_later", {
        fallbackKo: "나중에",
        fallbackEn: "Later",
      })}
      confirmLabel={safeT("settings_version_install_now", {
        fallbackKo: "지금 설치",
        fallbackEn: "Install now",
      })}
      onCancel={() => {
        if (!installBusy) setInstallReadyOpen(false);
      }}
      onConfirm={() => {
        if (installBusy) return;
        setInstallBusy(true);
        void (async () => {
          const result = await runAndroidPlayInAppUpdateCheck({
            manual: true,
            confirmComplete: true,
          });
          setInstallBusy(false);
          if (result.ran || result.reason === "awaiting_install_confirmation") {
            // completeUpdate restarts the process; keep dialog until then.
            return;
          }
          setInstallReadyOpen(false);
        })();
      }}
    />
  );
}
