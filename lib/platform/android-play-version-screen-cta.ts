/**
 * Pure CTA contract for 내정보 → 버전 정보 (Android Play In-App Updates).
 * UI must not invent availability — only Play API + install progress.
 */
import type {
  AndroidPlayUpdateInfo,
  AndroidVersionFreshness,
  PlayInstallStatus,
} from "@/lib/platform/android-play-in-app-update-policy";

export type VersionScreenPrimaryAction =
  | "none"
  | "check_retry"
  | "update_confirm"
  | "install_now";

export type VersionScreenCtaModel = {
  /** Status line under the version number (not the error banner). */
  statusKind:
    | "loading"
    | "checking"
    | "latest"
    | "update_available"
    | "downloading"
    | "install_ready"
    | "installing"
    | "canceled"
    | "check_failed"
    | "unavailable"
    | "unknown";
  /** Primary full-width button. */
  primaryEnabled: boolean;
  primaryAction: VersionScreenPrimaryAction;
  /** When true, show "업데이트" / "지금 업데이트" / "지금 설치" / "다시 확인". */
  showPrimaryButton: boolean;
  primaryLabelKind:
    | "update"
    | "update_now"
    | "install_now"
    | "retry_check"
    | "checking"
    | "downloading"
    | "installing"
    | "working";
};

/**
 * Visual surface for the primary CTA.
 * Colors: DIBAY tokens first (`--sam-primary` / `--sam-primary-active`);
 * latest/unavailable disabled uses solid gray (#D1D5DB / #6B7280) — not faded primary.
 */
export type VersionScreenCtaVisual = "disabled" | "active" | "busy" | "retry";

export function resolveVersionScreenCtaVisual(
  cta: VersionScreenCtaModel
): VersionScreenCtaVisual {
  if (cta.primaryAction === "check_retry") {
    return cta.primaryEnabled ? "retry" : "busy";
  }
  if (
    cta.statusKind === "downloading" ||
    cta.statusKind === "installing" ||
    cta.statusKind === "checking" ||
    cta.statusKind === "loading" ||
    cta.primaryLabelKind === "working" ||
    cta.primaryLabelKind === "downloading" ||
    cta.primaryLabelKind === "installing" ||
    cta.primaryLabelKind === "checking"
  ) {
    return "busy";
  }
  if (!cta.primaryEnabled) {
    return "disabled";
  }
  return "active";
}

export function resolveVersionScreenCta(args: {
  platformIsAndroidNative: boolean;
  loading: boolean;
  checking: boolean;
  updating: boolean;
  freshness: AndroidVersionFreshness;
  updateInfo: AndroidPlayUpdateInfo | null;
  installStatus: PlayInstallStatus | null;
  userCanceled: boolean;
  hasCheckError: boolean;
}): VersionScreenCtaModel {
  const install =
    args.installStatus ??
    args.updateInfo?.installStatus ??
    null;

  /**
   * 최종 설계 X6/S18 — 업데이트 버튼은 **Android 네이티브에서만** 렌더. iOS·웹은 버튼 자체가 없다
   * (배포 채널 미확인 상태에서 비활성 버튼·App Store 언급 금지).
   */
  if (!args.platformIsAndroidNative) {
    return {
      statusKind: "unavailable",
      primaryEnabled: false,
      primaryAction: "none",
      showPrimaryButton: false,
      primaryLabelKind: "update",
    };
  }

  if (args.loading) {
    return {
      statusKind: "loading",
      primaryEnabled: false,
      primaryAction: "none",
      showPrimaryButton: true,
      primaryLabelKind: "checking",
    };
  }

  if (args.checking && !args.updating) {
    return {
      statusKind: "checking",
      primaryEnabled: false,
      primaryAction: "none",
      showPrimaryButton: true,
      primaryLabelKind: "checking",
    };
  }

  if (install === "DOWNLOADING" || install === "PENDING") {
    return {
      statusKind: "downloading",
      primaryEnabled: false,
      primaryAction: "none",
      showPrimaryButton: true,
      primaryLabelKind: "downloading",
    };
  }

  if (install === "INSTALLING") {
    return {
      statusKind: "installing",
      primaryEnabled: false,
      primaryAction: "none",
      showPrimaryButton: true,
      primaryLabelKind: "installing",
    };
  }

  if (install === "DOWNLOADED") {
    return {
      statusKind: "install_ready",
      primaryEnabled: !args.updating,
      primaryAction: "install_now",
      showPrimaryButton: true,
      primaryLabelKind: args.updating ? "working" : "install_now",
    };
  }

  if (install === "CANCELED" || args.userCanceled) {
    return {
      statusKind: "canceled",
      primaryEnabled: !args.updating && !args.checking,
      primaryAction:
        args.freshness === "update_available" ? "update_confirm" : "check_retry",
      showPrimaryButton: true,
      primaryLabelKind:
        args.freshness === "update_available" ? "update_now" : "retry_check",
    };
  }

  if (install === "FAILED") {
    return {
      statusKind: "check_failed",
      primaryEnabled: !args.checking && !args.updating,
      primaryAction: "check_retry",
      showPrimaryButton: true,
      primaryLabelKind: "retry_check",
    };
  }

  if (args.hasCheckError || args.freshness === "check_failed") {
    return {
      statusKind: "check_failed",
      primaryEnabled: !args.checking && !args.updating,
      primaryAction: "check_retry",
      showPrimaryButton: true,
      primaryLabelKind: "retry_check",
    };
  }

  if (args.freshness === "update_available") {
    return {
      statusKind: "update_available",
      primaryEnabled: !args.updating,
      primaryAction: "update_confirm",
      showPrimaryButton: true,
      primaryLabelKind: args.updating ? "working" : "update_now",
    };
  }

  if (args.freshness === "latest") {
    return {
      statusKind: "latest",
      primaryEnabled: false,
      primaryAction: "none",
      showPrimaryButton: true,
      primaryLabelKind: "update",
    };
  }

  if (args.freshness === "unavailable") {
    return {
      statusKind: "unavailable",
      primaryEnabled: false,
      primaryAction: "none",
      showPrimaryButton: true,
      primaryLabelKind: "update",
    };
  }

  return {
    statusKind: "unknown",
    primaryEnabled: !args.checking,
    primaryAction: "check_retry",
    showPrimaryButton: true,
    primaryLabelKind: "retry_check",
  };
}
