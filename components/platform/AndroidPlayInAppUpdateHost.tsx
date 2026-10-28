"use client";

import { useEffect, useState } from "react";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import { formatInstalledVersionLabel } from "@/lib/platform/format-installed-version-label";
import {
  addAndroidFlexibleDownloadedListener,
  getAndroidPlayUpdateInfo,
} from "@/lib/platform/android-play-in-app-update";
import {
  acknowledgeAndroidPlayUpdateDeferred,
  dismissAndroidFlexibleInstallReadyForThisRun,
  isAndroidFlexibleInstallReadyDismissedForThisRun,
  runAndroidPlayInAppUpdateCheck,
  type AndroidPlayUpdateAvailablePayload,
  subscribeAndroidFlexibleInstallReady,
  subscribeAndroidFlexibleUpdateAvailable,
} from "@/lib/platform/android-play-in-app-update-orchestrator";

/**
 * Android-only Play In-App Updates host.
 * Cold start + resume check (FLEXIBLE default with confirm). Never mounts Play UI during calls
 * (native plugin rejects call_in_progress). Flexible install requires explicit confirm.
 * Available dialog shows only versions the native plugin reported (D2).
 * Install-ready "나중에" hides it for this app run; native events re-check Play state (D3).
 */
export function AndroidPlayInAppUpdateHost() {
  const { safeT } = useI18n();
  const [availableOpen, setAvailableOpen] = useState(false);
  const [availableBusy, setAvailableBusy] = useState(false);
  const [availablePayload, setAvailablePayload] =
    useState<AndroidPlayUpdateAvailablePayload | null>(null);
  const [installReadyOpen, setInstallReadyOpen] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;
    if (resolveCapacitorShellPlatform() !== "android") return;

    let cancelled = false;
    const openInstallReady = () => {
      if (cancelled || isAndroidFlexibleInstallReadyDismissedForThisRun()) return;
      setAvailableOpen(false);
      setInstallReadyOpen(true);
    };
    /** Native "downloaded" events can be retained/replayed — open only if Play still reports DOWNLOADED. */
    const openInstallReadyIfStillDownloaded = () => {
      if (cancelled || isAndroidFlexibleInstallReadyDismissedForThisRun()) return;
      void (async () => {
        const result = await getAndroidPlayUpdateInfo();
        if (!result.ok || result.info.installStatus !== "DOWNLOADED") return;
        openInstallReady();
      })();
    };
    const openAvailable = (payload: AndroidPlayUpdateAvailablePayload) => {
      if (cancelled) return;
      setAvailablePayload(payload);
      setAvailableOpen(true);
    };

    const unsubInstall = subscribeAndroidFlexibleInstallReady(openInstallReady);
    const unsubAvailable = subscribeAndroidFlexibleUpdateAvailable(openAvailable);
    let removeNative: (() => void) | undefined;
    let removeAppState: (() => void) | undefined;

    void (async () => {
      const nativeHandle = await addAndroidFlexibleDownloadedListener(openInstallReadyIfStillDownloaded);
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

  const installedLabel = formatInstalledVersionLabel(
    availablePayload?.installedVersionName,
    availablePayload?.installedVersionCode
  );
  const availableCode = availablePayload?.availableVersionCode;
  const availableBuild = availableCode != null && availableCode > 0 ? availableCode : null;
  const availableDescription = safeT("settings_version_update_available_desc", {
    fallbackKo: "Google Play에서 새 버전을 받을 수 있습니다. 지금 업데이트하거나 나중에 할 수 있습니다.",
    fallbackEn: "A newer version is available on Google Play. Update now or later.",
  });

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
        description={
          <>
            {availableDescription}
            {installedLabel || availableBuild != null ? (
              <span className="mt-2 block tabular-nums" data-testid="android-play-update-versions">
                {installedLabel ? (
                  <span className="block">
                    {safeT("settings_version_current_label", {
                      fallbackKo: "현재 버전",
                      fallbackEn: "Current version",
                    })}{" "}
                    <span className="font-semibold text-sam-fg">{installedLabel}</span>
                  </span>
                ) : null}
                {availableBuild != null ? (
                  <span className="block">
                    {safeT("settings_version_new_build_label", {
                      fallbackKo: "새 빌드",
                      fallbackEn: "New build",
                    })}{" "}
                    <span className="font-semibold text-sam-fg">{availableBuild}</span>
                  </span>
                ) : null}
              </span>
            ) : null}
          </>
        }
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
          acknowledgeAndroidPlayUpdateDeferred(availablePayload?.availableVersionCode);
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
          if (installBusy) return;
          dismissAndroidFlexibleInstallReadyForThisRun();
          setInstallReadyOpen(false);
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
