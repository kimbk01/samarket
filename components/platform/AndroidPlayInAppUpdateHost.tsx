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
  acknowledgeAndroidPlayUpdateDeferred,
  runAndroidPlayInAppUpdateCheck,
  subscribeAndroidFlexibleInstallReady,
  subscribeAndroidFlexibleUpdateAvailable,
} from "@/lib/platform/android-play-in-app-update-orchestrator";

/**
 * Android-only Play In-App Updates host.
 * Cold start + resume check (FLEXIBLE default with confirm). Never mounts Play UI during calls
 * (native plugin rejects call_in_progress). Flexible install requires explicit confirm.
 */
export function AndroidPlayInAppUpdateHost() {
  const { safeT } = useI18n();
  const [availableOpen, setAvailableOpen] = useState(false);
  const [availableBusy, setAvailableBusy] = useState(false);
  const [installReadyOpen, setInstallReadyOpen] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;
    if (resolveCapacitorShellPlatform() !== "android") return;

    let cancelled = false;
    const openInstallReady = () => {
      if (!cancelled) {
        setAvailableOpen(false);
        setInstallReadyOpen(true);
      }
    };
    const openAvailable = () => {
      if (!cancelled) setAvailableOpen(true);
    };

    const unsubInstall = subscribeAndroidFlexibleInstallReady(openInstallReady);
    const unsubAvailable = subscribeAndroidFlexibleUpdateAvailable(() => {
      openAvailable();
    });
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
      unsubInstall();
      unsubAvailable();
      removeNative?.();
      removeAppState?.();
    };
  }, []);

  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") {
    return null;
  }

  return (
    <>
      <DibayConfirmDialog
        open={availableOpen}
        blocking={false}
        busy={availableBusy}
        title={safeT("settings_version_update_available_title", {
          fallbackKo: "새로운 DIBAY 업데이트가 있습니다",
          fallbackEn: "A new DIBAY update is available",
        })}
        description={safeT("settings_version_update_available_desc", {
          fallbackKo: "Google Play에서 새 버전을 받을 수 있습니다. 지금 업데이트하거나 나중에 할 수 있습니다.",
          fallbackEn: "A newer version is available on Google Play. Update now or later.",
        })}
        cancelLabel={safeT("settings_version_install_later", {
          fallbackKo: "나중에",
          fallbackEn: "Later",
        })}
        confirmLabel={safeT("settings_version_update_now", {
          fallbackKo: "지금 업데이트",
          fallbackEn: "Update now",
        })}
        onCancel={() => {
          if (availableBusy) return;
          acknowledgeAndroidPlayUpdateDeferred();
          setAvailableOpen(false);
        }}
        onConfirm={() => {
          if (availableBusy) return;
          setAvailableBusy(true);
          void (async () => {
            const result = await runAndroidPlayInAppUpdateCheck({
              confirmStart: true,
            });
            setAvailableBusy(false);
            if (result.ran || result.reason === "awaiting_install_confirmation") {
              setAvailableOpen(false);
              return;
            }
            if (result.reason === "awaiting_start_confirmation") {
              return;
            }
            setAvailableOpen(false);
          })();
        }}
      />
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
    </>
  );
}
