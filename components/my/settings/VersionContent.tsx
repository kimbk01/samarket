"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Image from "next/image";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import {
  DIBAY_APP_ICON_512_PATH,
  dibayBrandAssetUrl,
} from "@/lib/brand/brand-asset-paths";
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
import { fetchAndroidUpdateServerPolicy } from "@/lib/platform/android-play-in-app-update-orchestrator";
import {
  decideAndroidPlayUpdateFlow,
  resolveAndroidVersionFreshness,
  type AndroidPlayUpdateInfo,
  type AndroidVersionFreshness,
  type PlayInstallStatus,
} from "@/lib/platform/android-play-in-app-update-policy";
import {
  resolveVersionScreenCta,
  resolveVersionScreenCtaVisual,
  type VersionScreenCtaModel,
  type VersionScreenCtaVisual,
} from "@/lib/platform/android-play-version-screen-cta";

/** Inline colors beat WebView/Tailwind cascade so disabled gray is always visible. */
function versionCtaInlineStyle(visual: VersionScreenCtaVisual): CSSProperties {
  switch (visual) {
    case "disabled":
      return {
        backgroundColor: "var(--sam-border-default)",
        color: "var(--sam-text-secondary)",
        opacity: 1,
        borderWidth: 0,
      };
    case "busy":
    case "active":
      return {
        backgroundColor: "var(--sam-primary)",
        color: "var(--sam-text-on-primary)",
        opacity: 1,
        borderWidth: 0,
      };
    case "retry":
      return {
        backgroundColor: "var(--sam-primary-soft)",
        color: "var(--sam-primary)",
        opacity: 1,
        border: "1px solid var(--sam-primary-border)",
      };
    default:
      return {};
  }
}

type InstallProgress = {
  installStatus: PlayInstallStatus;
  bytesDownloaded?: number;
  totalBytesToDownload?: number;
};

type SafeT = (key: MessageKey, fallbacks?: string | SafeTranslateOptions) => string;

function statusLineFromCta(
  cta: VersionScreenCtaModel,
  progress: InstallProgress | null,
  safeT: SafeT
): string {
  switch (cta.statusKind) {
    case "loading":
    case "checking":
      return safeT("settings_version_checking_status", {
        fallbackKo: "업데이트 확인 중…",
        fallbackEn: "Checking for updates…",
      });
    case "latest":
      return safeT("settings_version_status_latest", {
        fallbackKo: "최신 버전입니다.",
        fallbackEn: "You are on the latest version.",
      });
    case "update_available":
      return safeT("settings_version_status_update_available", {
        fallbackKo: "새 버전이 있습니다.",
        fallbackEn: "A newer version is available.",
      });
    case "downloading": {
      const downloaded = progress?.bytesDownloaded;
      const total = progress?.totalBytesToDownload;
      if (
        typeof downloaded === "number" &&
        typeof total === "number" &&
        total > 0 &&
        Number.isFinite(downloaded) &&
        Number.isFinite(total)
      ) {
        const pct = Math.min(100, Math.max(0, Math.floor((downloaded / total) * 100)));
        return safeT("settings_version_download_progress", {
          fallbackKo: `업데이트 다운로드 중… ${pct}%`,
          fallbackEn: `Downloading update… ${pct}%`,
        });
      }
      return safeT("settings_version_downloading", {
        fallbackKo: "업데이트 다운로드 중…",
        fallbackEn: "Downloading update…",
      });
    }
    case "install_ready":
      return safeT("settings_version_install_ready_status", {
        fallbackKo: "업데이트를 설치할 준비가 됐습니다.",
        fallbackEn: "The update is ready to install.",
      });
    case "installing":
      return safeT("settings_version_installing", {
        fallbackKo: "업데이트 설치 중…",
        fallbackEn: "Installing update…",
      });
    case "canceled":
      return safeT("settings_version_canceled", {
        fallbackKo: "업데이트가 취소되었습니다.",
        fallbackEn: "The update was canceled.",
      });
    case "check_failed":
      return safeT("settings_version_status_check_failed", {
        fallbackKo: "업데이트 정보를 확인하지 못했습니다.",
        fallbackEn: "Could not load update information.",
      });
    case "unavailable":
      return safeT("settings_version_status_unavailable", {
        fallbackKo: "이 환경에서는 앱 업데이트를 사용할 수 없습니다.",
        fallbackEn: "App updates are not available in this environment.",
      });
    default:
      return safeT("settings_version_status_unknown", {
        fallbackKo: "업데이트 가능 여부를 아직 확인하지 못했습니다.",
        fallbackEn: "Update availability has not been confirmed yet.",
      });
  }
}

function primaryLabelFromCta(cta: VersionScreenCtaModel, safeT: SafeT): string {
  switch (cta.primaryLabelKind) {
    case "update_now":
      return safeT("settings_version_update_now", {
        fallbackKo: "지금 업데이트",
        fallbackEn: "Update now",
      });
    case "install_now":
      return safeT("settings_version_install_now", {
        fallbackKo: "지금 설치",
        fallbackEn: "Install now",
      });
    case "retry_check":
      return safeT("settings_version_retry_check", {
        fallbackKo: "다시 확인",
        fallbackEn: "Check again",
      });
    case "checking":
      return safeT("settings_version_checking_status", {
        fallbackKo: "업데이트 확인 중…",
        fallbackEn: "Checking for updates…",
      });
    case "downloading":
      return safeT("settings_version_downloading", {
        fallbackKo: "업데이트 다운로드 중…",
        fallbackEn: "Downloading update…",
      });
    case "installing":
      return safeT("settings_version_installing", {
        fallbackKo: "업데이트 설치 중…",
        fallbackEn: "Installing update…",
      });
    case "working":
      return safeT("settings_version_updating", {
        fallbackKo: "진행 중…",
        fallbackEn: "Working…",
      });
    case "update":
    default:
      return safeT("settings_version_update_button", {
        fallbackKo: "업데이트",
        fallbackEn: "Update",
      });
  }
}

export function VersionContent() {
  const { safeT } = useI18n();
  const isAndroidNative =
    isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";

  const [versionName, setVersionName] = useState<string>("");
  /** Android versionCode / iOS build — 설치 확인 기준(user_devices.app_version 과 같은 「버전 (빌드)」) */
  const [buildNumber, setBuildNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<AndroidPlayUpdateInfo | null>(null);
  const [freshness, setFreshness] = useState<AndroidVersionFreshness>("unknown");
  const [webFallbackNote, setWebFallbackNote] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [userCanceled, setUserCanceled] = useState(false);
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);
  const [confirmInstallOpen, setConfirmInstallOpen] = useState(false);

  const loadInstalled = useCallback(async () => {
    setLoading(true);
    setErrorDetail(null);
    try {
      if (isAndroidNative) {
        const native = await getAndroidInstalledVersion();
        if (native) {
          setVersionName(native.versionName || "");
          setBuildNumber(native.versionCode);
          return;
        }
        const cap = await getCapacitorAppInstalledVersion();
        if (cap) {
          setVersionName(cap.versionName || "");
          setBuildNumber(cap.versionCode);
          return;
        }
        setErrorDetail(
          safeT("settings_version_native_read_failed", {
            fallbackKo: "설치된 앱 버전을 읽지 못했습니다",
            fallbackEn: "Could not read the installed app version",
          })
        );
        return;
      }

      if (isCapacitorNativePlatform()) {
        const cap = await getCapacitorAppInstalledVersion();
        if (cap) {
          setVersionName(cap.versionName || "");
          setBuildNumber(cap.versionCode);
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
      return;
    }
    setChecking(true);
    setErrorDetail(null);
    try {
      const result = await getAndroidPlayUpdateInfo();
      if (!result.ok) {
        setUpdateInfo(null);
        setFreshness("check_failed");
        setErrorDetail(
          safeT("settings_version_check_failed_detail", {
            fallbackKo:
              "Google Play에서 업데이트 정보를 확인하지 못했습니다. 네트워크와 Play 스토어 설치 여부를 확인해 주세요.",
            fallbackEn:
              "Could not get update info from Google Play. Check your network and that the app was installed from Play Store.",
          })
        );
        return;
      }
      setUpdateInfo(result.info);
      setUserCanceled(false);
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
    setErrorDetail(null);
    setUserCanceled(false);
    try {
      const liveInstall =
        installProgress?.installStatus ?? updateInfo.installStatus ?? null;
      if (liveInstall === "DOWNLOADED") {
        const completed = await completeAndroidFlexibleUpdate();
        if (!completed.ok) {
          setErrorDetail(
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
          setErrorDetail(
            safeT("settings_version_blocked_by_call", {
              fallbackKo: "통화 중에는 업데이트를 시작할 수 없습니다",
              fallbackEn: "Updates cannot start while a call is in progress",
            })
          );
          return;
        }
        setErrorDetail(
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
          const flex = await startAndroidFlexibleUpdate();
          if (!flex.ok) {
            setErrorDetail(
              safeT("settings_version_start_failed", {
                fallbackKo: "업데이트를 시작하지 못했습니다",
                fallbackEn: "Could not start the update",
              })
            );
          } else if (flex.result.status === "canceled") {
            setUserCanceled(true);
          }
        } else if (started.result.status === "canceled") {
          setUserCanceled(true);
        }
        return;
      }

      if (decision.choice === "flexible" || decision.choice === "complete_flexible") {
        if (decision.choice === "complete_flexible") {
          const completed = await completeAndroidFlexibleUpdate();
          if (!completed.ok) {
            setErrorDetail(
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
            setErrorDetail(
              safeT("settings_version_blocked_by_call", {
                fallbackKo: "통화 중에는 업데이트를 시작할 수 없습니다",
                fallbackEn: "Updates cannot start while a call is in progress",
              })
            );
            return;
          }
          setErrorDetail(
            safeT("settings_version_start_failed", {
              fallbackKo: "업데이트를 시작하지 못했습니다",
              fallbackEn: "Could not start the update",
            })
          );
        } else if (started.result.status === "canceled") {
          setUserCanceled(true);
        }
      }
    } finally {
      setUpdating(false);
      void loadInstalled();
      void checkForUpdate();
    }
  }, [isAndroidNative, updateInfo, installProgress, safeT, checkForUpdate, loadInstalled]);

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
        if (event.installStatus === "CANCELED") {
          setUserCanceled(true);
        }
        if (
          event.installStatus === "DOWNLOADED" ||
          event.installStatus === "FAILED" ||
          event.installStatus === "CANCELED"
        ) {
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

  const cta = useMemo(
    () =>
      resolveVersionScreenCta({
        platformIsAndroidNative: isAndroidNative,
        loading,
        checking,
        updating,
        freshness,
        updateInfo,
        installStatus: installProgress?.installStatus ?? null,
        userCanceled,
        hasCheckError: Boolean(errorDetail) && freshness === "check_failed",
      }),
    [
      isAndroidNative,
      loading,
      checking,
      updating,
      freshness,
      updateInfo,
      installProgress,
      userCanceled,
      errorDetail,
    ]
  );

  const statusLine = statusLineFromCta(cta, installProgress, safeT);
  const primaryLabel = primaryLabelFromCta(cta, safeT);
  const ctaVisual = resolveVersionScreenCtaVisual(cta);
  const displayName = versionName
    ? buildNumber != null
      ? `${versionName} (${buildNumber})`
      : versionName
    : safeT("settings_version_unknown_name", {
        fallbackKo: "알 수 없음",
        fallbackEn: "Unknown",
      });
  /** 웹 화면 코드 배포 버전 — 네이티브 앱 버전과 별개 (웹 변경은 앱 재시작으로 반영) */
  const webDeploySha = (process.env.NEXT_PUBLIC_WEB_DEPLOY_SHA ?? "").trim();
  const showCurrentVersionLabel =
    cta.statusKind === "update_available" ||
    cta.statusKind === "downloading" ||
    cta.statusKind === "install_ready" ||
    cta.statusKind === "installing" ||
    cta.statusKind === "canceled";
  const dialogOpen = confirmStartOpen || confirmInstallOpen;
  const ctaBusy =
    updating ||
    cta.statusKind === "downloading" ||
    cta.statusKind === "installing" ||
    cta.statusKind === "checking" ||
    cta.statusKind === "loading";

  const onPrimaryClick = () => {
    if (!cta.primaryEnabled || dialogOpen || updating) return;
    if (cta.primaryAction === "check_retry") {
      void checkForUpdate();
      return;
    }
    if (cta.primaryAction === "update_confirm") {
      setConfirmStartOpen(true);
      return;
    }
    if (cta.primaryAction === "install_now") {
      setConfirmInstallOpen(true);
    }
  };

  const statusToneClass =
    cta.statusKind === "check_failed"
      ? "text-sam-danger"
      : cta.statusKind === "latest" || cta.statusKind === "update_available"
        ? "text-sam-primary"
        : "text-sam-muted";

  return (
    <div className="flex min-h-[min(70vh,520px)] flex-col bg-sam-surface px-1">
      <div className="flex flex-1 flex-col items-center justify-center px-5 pb-10 pt-8 text-center">
        <Image
          src={dibayBrandAssetUrl(DIBAY_APP_ICON_512_PATH)}
          alt=""
          width={80}
          height={80}
          unoptimized
          priority
          className="mb-7 h-20 w-20 shrink-0 object-contain"
        />

        {loading ? (
          <p className={`${Sam.text.body} text-sam-muted`}>
            {safeT("settings_version_loading", {
              fallbackKo: "확인 중",
              fallbackEn: "Checking",
            })}
          </p>
        ) : showCurrentVersionLabel ? (
          <p className={`${Sam.text.bodyLg} text-sam-fg`}>
            {safeT("settings_version_current_label", {
              fallbackKo: "현재 버전",
              fallbackEn: "Current version",
            })}{" "}
            {displayName}
          </p>
        ) : (
          <p className={`${Sam.text.bodyLg} text-sam-fg`}>
            {safeT("settings_version_label", {
              fallbackKo: "버전",
              fallbackEn: "Version",
            })}{" "}
            {displayName}
          </p>
        )}

        {webDeploySha ? (
          <p className={`mt-1 ${Sam.text.helper} tabular-nums text-sam-muted`} data-testid="version-web-deploy-sha">
            {safeT("settings_version_web_deploy_label", {
              fallbackKo: "웹 배포",
              fallbackEn: "Web build",
            })}{" "}
            {webDeploySha}
          </p>
        ) : null}

        <p className={`mt-3 min-h-[1.5rem] ${Sam.text.body} ${statusToneClass}`} aria-live="polite">
          {webFallbackNote && cta.statusKind === "unavailable" ? webFallbackNote : statusLine}
        </p>

        {errorDetail && cta.statusKind === "check_failed" ? (
          <p className={`mt-2 max-w-sm ${Sam.text.helper} text-sam-muted`}>{errorDetail}</p>
        ) : null}

        {cta.showPrimaryButton ? (
          <button
            type="button"
            disabled={!cta.primaryEnabled}
            aria-disabled={!cta.primaryEnabled}
            aria-busy={ctaBusy}
            onClick={onPrimaryClick}
            data-cta-visual={ctaVisual}
            style={versionCtaInlineStyle(ctaVisual)}
            className="version-update-cta sam-btn sam-btn--block mt-10 w-full max-w-sm"
          >
            {primaryLabel}
          </button>
        ) : null}
      </div>

      <DibayConfirmDialog
        open={confirmStartOpen}
        blocking={false}
        busy={updating}
        title={safeT("settings_version_update_available_title", {
          fallbackKo: "새로운 DIBAY 업데이트가 있습니다",
          fallbackEn: "A new DIBAY update is available",
        })}
        description={safeT("settings_version_update_available_desc", {
          fallbackKo:
            "Google Play에서 새 버전을 받을 수 있습니다. 지금 업데이트하거나 나중에 할 수 있습니다.",
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
          if (updating) return;
          setConfirmStartOpen(false);
        }}
        onConfirm={() => {
          if (updating) return;
          setConfirmStartOpen(false);
          void runUpdate();
        }}
      />

      <DibayConfirmDialog
        open={confirmInstallOpen}
        blocking={false}
        busy={updating}
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
          if (updating) return;
          setConfirmInstallOpen(false);
        }}
        onConfirm={() => {
          if (updating) return;
          setConfirmInstallOpen(false);
          void runUpdate();
        }}
      />
    </div>
  );
}
