"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";
import type { MessageKey } from "@/lib/i18n/messages";
import type { SafeTranslateOptions } from "@/lib/i18n/safe-translate";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import {
  addAndroidPlayInstallStatusListener,
  getAndroidInstalledVersion,
  getAndroidPlayUpdateInfo,
  getCapacitorAppInstalledVersion,
  startAndroidFlexibleUpdate,
  startAndroidImmediateUpdate,
  completeAndroidFlexibleUpdate,
} from "@/lib/platform/android-play-in-app-update";
import {
  fetchAndroidUpdateServerPolicy,
} from "@/lib/platform/android-play-in-app-update-orchestrator";
import {
  decideAndroidPlayUpdateFlow,
  resolveAndroidVersionFreshness,
  type AndroidPlayUpdateInfo,
  type AndroidVersionFreshness,
  type PlayInstallStatus,
} from "@/lib/platform/android-play-in-app-update-policy";

type InstallProgress = {
  installStatus: PlayInstallStatus;
  bytesDownloaded?: number;
  totalBytesToDownload?: number;
};

function installProgressLabel(
  progress: InstallProgress | null,
  safeT: (key: MessageKey, fallbacks?: string | SafeTranslateOptions) => string
): string | null {
  if (!progress) return null;
  const status = progress.installStatus;
  if (status === "DOWNLOADING" || status === "PENDING") {
    const downloaded = progress.bytesDownloaded;
    const total = progress.totalBytesToDownload;
    if (
      typeof downloaded === "number" &&
      typeof total === "number" &&
      total > 0 &&
      Number.isFinite(downloaded) &&
      Number.isFinite(total)
    ) {
      const pct = Math.min(100, Math.max(0, Math.floor((downloaded / total) * 100)));
      return safeT("settings_version_download_progress", {
        fallbackKo: `다운로드 중… ${pct}%`,
        fallbackEn: `Downloading… ${pct}%`,
      });
    }
    return safeT("settings_version_downloading", {
      fallbackKo: "업데이트 다운로드 중…",
      fallbackEn: "Downloading update…",
    });
  }
  if (status === "DOWNLOADED") {
    return safeT("settings_version_install_ready_desc", {
      fallbackKo: "다운로드가 완료되었습니다. 지금 설치하면 앱이 다시 시작됩니다.",
      fallbackEn: "Download finished. Installing now will restart the app.",
    });
  }
  if (status === "INSTALLING") {
    return safeT("settings_version_installing", {
      fallbackKo: "업데이트 설치 중…",
      fallbackEn: "Installing update…",
    });
  }
  if (status === "FAILED" || status === "CANCELED") {
    return safeT("settings_version_start_failed", {
      fallbackKo: "업데이트를 시작하지 못했습니다",
      fallbackEn: "Could not start the update",
    });
  }
  return null;
}

function freshnessLabel(
  freshness: AndroidVersionFreshness,
  safeT: (key: MessageKey, fallbacks?: string | SafeTranslateOptions) => string
): string {
  switch (freshness) {
    case "latest":
      return safeT("settings_version_status_latest", {
        fallbackKo: "최신 버전입니다",
        fallbackEn: "You are on the latest version",
      });
    case "update_available":
      return safeT("settings_version_status_update_available", {
        fallbackKo: "새 버전이 있습니다",
        fallbackEn: "A newer version is available",
      });
    case "check_failed":
      return safeT("settings_version_status_check_failed", {
        fallbackKo: "업데이트 확인에 실패했습니다",
        fallbackEn: "Could not check for updates",
      });
    case "unavailable":
      return safeT("settings_version_status_unavailable", {
        fallbackKo: "이 환경에서는 Play 업데이트를 확인할 수 없습니다",
        fallbackEn: "Play updates cannot be checked in this environment",
      });
    default:
      return safeT("settings_version_status_unknown", {
        fallbackKo: "업데이트 가능 여부를 아직 확인하지 못했습니다",
        fallbackEn: "Update availability has not been confirmed yet",
      });
  }
}

export function VersionContent() {
  const { safeT } = useI18n();
  const isAndroidNative =
    isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";

  const [versionName, setVersionName] = useState<string>("");
  const [versionCode, setVersionCode] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<AndroidPlayUpdateInfo | null>(null);
  const [freshness, setFreshness] = useState<AndroidVersionFreshness>("unknown");
  const [webFallbackNote, setWebFallbackNote] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);

  const loadInstalled = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAndroidNative) {
        const native = await getAndroidInstalledVersion();
        if (native) {
          setVersionName(native.versionName || "");
          setVersionCode(native.versionCode);
          return;
        }
        const cap = await getCapacitorAppInstalledVersion();
        if (cap) {
          setVersionName(cap.versionName || "");
          setVersionCode(cap.versionCode);
          return;
        }
        setError(
          safeT("settings_version_native_read_failed", {
            fallbackKo: "설치된 앱 버전을 읽지 못했습니다",
            fallbackEn: "Could not read the installed app version",
          })
        );
        return;
      }

      // Web / iOS: show Capacitor info when native, otherwise note that this is not Play install version.
      if (isCapacitorNativePlatform()) {
        const cap = await getCapacitorAppInstalledVersion();
        if (cap) {
          setVersionName(cap.versionName || "");
          setVersionCode(cap.versionCode);
          setWebFallbackNote(
            safeT("settings_version_ios_note", {
              fallbackKo: "iOS에서는 App Store 업데이트를 사용합니다",
              fallbackEn: "On iOS, updates are delivered through the App Store",
            })
          );
          setFreshness("unavailable");
          return;
        }
      }

      setVersionName("");
      setVersionCode(null);
      setWebFallbackNote(
        safeT("settings_version_web_note", {
          fallbackKo: "웹에서는 설치 앱 버전(Play)을 표시하지 않습니다",
          fallbackEn: "Installed Play app version is not shown on web",
        })
      );
      setFreshness("unavailable");
    } finally {
      setLoading(false);
    }
  }, [isAndroidNative, safeT]);

  const checkForUpdate = useCallback(async () => {
    if (!isAndroidNative) {
      setFreshness("unavailable");
      setError(
        safeT("settings_version_status_unavailable", {
          fallbackKo: "이 환경에서는 Play 업데이트를 확인할 수 없습니다",
          fallbackEn: "Play updates cannot be checked in this environment",
        })
      );
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const result = await getAndroidPlayUpdateInfo();
      if (!result.ok) {
        setUpdateInfo(null);
        setFreshness("check_failed");
        setError(
          safeT("settings_version_check_failed_detail", {
            fallbackKo: "Google Play에서 업데이트 정보를 확인하지 못했습니다. 네트워크와 Play 스토어 설치 여부를 확인해 주세요.",
            fallbackEn:
              "Could not get update info from Google Play. Check your network and that the app was installed from Play Store.",
          })
        );
        return;
      }
      setUpdateInfo(result.info);
      const next = resolveAndroidVersionFreshness({
        platformIsAndroidNative: true,
        updateInfo: result.info,
        checkError: null,
      });
      setFreshness(next);
    } finally {
      setChecking(false);
    }
  }, [isAndroidNative, safeT]);

  const runUpdate = useCallback(async () => {
    if (!isAndroidNative || !updateInfo) return;
    setUpdating(true);
    setError(null);
    try {
      if (updateInfo.installStatus === "DOWNLOADED") {
        const completed = await completeAndroidFlexibleUpdate();
        if (!completed.ok) {
          setError(
            safeT("settings_version_install_failed", {
              fallbackKo: "업데이트 설치를 시작하지 못했습니다",
              fallbackEn: "Could not start installing the update",
            })
          );
        }
        return;
      }

      const policy = await fetchAndroidUpdateServerPolicy();
      const decision = decideAndroidPlayUpdateFlow({
        info: updateInfo,
        policy,
        blockUi: updateInfo.callInProgress === true,
      });

      if (decision.choice === "none") {
        if (decision.reason === "ui_blocked" || updateInfo.callInProgress) {
          setError(
            safeT("settings_version_blocked_by_call", {
              fallbackKo: "통화 중에는 업데이트를 시작할 수 없습니다",
              fallbackEn: "Updates cannot start while a call is in progress",
            })
          );
          return;
        }
        setError(
          safeT("settings_version_no_flow", {
            fallbackKo: "지금은 Play 업데이트를 시작할 수 없습니다",
            fallbackEn: "Play update cannot be started right now",
          })
        );
        return;
      }

      if (decision.choice === "immediate") {
        const started = await startAndroidImmediateUpdate();
        if (!started.ok) {
          // Safe recovery: try flexible when immediate is unavailable.
          const flex = await startAndroidFlexibleUpdate();
          if (!flex.ok) {
            setError(
              safeT("settings_version_start_failed", {
                fallbackKo: "업데이트를 시작하지 못했습니다",
                fallbackEn: "Could not start the update",
              })
            );
          }
        }
        return;
      }

      if (decision.choice === "flexible" || decision.choice === "complete_flexible") {
        if (decision.choice === "complete_flexible") {
          const completed = await completeAndroidFlexibleUpdate();
          if (!completed.ok) {
            setError(
              safeT("settings_version_install_failed", {
                fallbackKo: "업데이트 설치를 시작하지 못했습니다",
                fallbackEn: "Could not start installing the update",
              })
            );
          }
          return;
        }
        const started = await startAndroidFlexibleUpdate();
        if (!started.ok) {
          if (started.code === "call_in_progress") {
            setError(
              safeT("settings_version_blocked_by_call", {
                fallbackKo: "통화 중에는 업데이트를 시작할 수 없습니다",
                fallbackEn: "Updates cannot start while a call is in progress",
              })
            );
            return;
          }
          setError(
            safeT("settings_version_start_failed", {
              fallbackKo: "업데이트를 시작하지 못했습니다",
              fallbackEn: "Could not start the update",
            })
          );
        } else if (started.result.status === "canceled") {
          setError(null);
        }
      }
    } finally {
      setUpdating(false);
      void checkForUpdate();
    }
  }, [isAndroidNative, updateInfo, safeT, checkForUpdate]);

  useEffect(() => {
    void loadInstalled();
  }, [loadInstalled]);

  useEffect(() => {
    if (!isAndroidNative || loading) return;
    void checkForUpdate();
  }, [isAndroidNative, loading, checkForUpdate]);

  useEffect(() => {
    if (!isAndroidNative) return;
    let removed = false;
    let handle: { remove: () => Promise<void> } | null = null;
    void (async () => {
      const h = await addAndroidPlayInstallStatusListener((event) => {
        if (removed) return;
        setInstallProgress(event);
        if (event.installStatus === "DOWNLOADED" || event.installStatus === "FAILED") {
          void checkForUpdate();
        }
      });
      if (removed) {
        void h?.remove();
        return;
      }
      handle = h;
    })();
    return () => {
      removed = true;
      void handle?.remove();
    };
  }, [isAndroidNative, checkForUpdate]);

  const showUpdateButton =
    isAndroidNative &&
    (freshness === "update_available" ||
      updateInfo?.installStatus === "DOWNLOADED" ||
      installProgress?.installStatus === "DOWNLOADED");

  const progressText = installProgressLabel(installProgress, safeT);

  return (
    <div className="space-y-3">
      <p className="sam-text-body text-sam-fg">
        {safeT("settings_version_installed_label", {
          fallbackKo: "설치된 앱 버전",
          fallbackEn: "Installed app version",
        })}{" "}
        {loading
          ? safeT("settings_version_loading", {
              fallbackKo: "확인 중",
              fallbackEn: "Checking",
            })
          : versionName ||
            safeT("settings_version_unknown_name", {
              fallbackKo: "알 수 없음",
              fallbackEn: "Unknown",
            })}
        {!loading && versionCode != null ? ` · versionCode ${versionCode}` : ""}
      </p>

      <p
        className={`sam-text-body-secondary ${
          freshness === "check_failed" || error ? "text-red-600" : "text-sam-muted"
        }`}
      >
        {error || webFallbackNote || freshnessLabel(freshness, safeT)}
      </p>

      {progressText ? (
        <p className="sam-text-body-secondary text-sam-muted" aria-live="polite">
          {progressText}
        </p>
      ) : null}

      {isAndroidNative ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={checking || updating || loading}
            onClick={() => void checkForUpdate()}
            className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} disabled:opacity-50`}
          >
            {checking
              ? safeT("settings_version_checking", {
                  fallbackKo: "확인 중…",
                  fallbackEn: "Checking…",
                })
              : safeT("settings_version_check_button", {
                  fallbackKo: "업데이트 확인",
                  fallbackEn: "Check for updates",
                })}
          </button>
          {showUpdateButton ? (
            <button
              type="button"
              disabled={checking || updating || loading}
              onClick={() => void runUpdate()}
              className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} disabled:opacity-50`}
            >
              {updating
                ? safeT("settings_version_updating", {
                    fallbackKo: "진행 중…",
                    fallbackEn: "Working…",
                  })
                : updateInfo?.installStatus === "DOWNLOADED"
                  ? safeT("settings_version_install_now", {
                      fallbackKo: "지금 설치",
                      fallbackEn: "Install now",
                    })
                  : safeT("settings_version_update_button", {
                      fallbackKo: "업데이트",
                      fallbackEn: "Update",
                    })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
