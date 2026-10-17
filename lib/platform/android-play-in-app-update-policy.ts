/**
 * Pure policy for Android Play In-App Updates.
 * Default is FLEXIBLE. IMMEDIATE only when server policy + Play allow it.
 */

export type PlayUpdateAvailability =
  | "UPDATE_AVAILABLE"
  | "UPDATE_NOT_AVAILABLE"
  | "DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS"
  | "UNKNOWN"
  | string;

export type PlayInstallStatus =
  | "UNKNOWN"
  | "PENDING"
  | "DOWNLOADING"
  | "DOWNLOADED"
  | "INSTALLING"
  | "INSTALLED"
  | "FAILED"
  | "CANCELED"
  | "REQUIRES_UI_INTENT"
  | string;

export type AndroidPlayUpdateInfo = {
  updateAvailability: PlayUpdateAvailability;
  installStatus: PlayInstallStatus;
  availableVersionCode?: number;
  installedVersionCode?: number;
  flexibleAllowed?: boolean;
  immediateAllowed?: boolean;
  callInProgress?: boolean;
  updatePriority?: number;
};

export type AndroidUpdateServerPolicy = {
  /** When installed versionCode < this, prefer IMMEDIATE if Play allows. */
  androidMinVersionCode: number | null;
  /** Explicit force flag from app_meta (`1` / `true`). Default false. */
  androidImmediateUpdate: boolean;
};

export type AndroidUpdateFlowChoice = "none" | "flexible" | "immediate" | "complete_flexible";

export type AndroidUpdateFlowDecision = {
  choice: AndroidUpdateFlowChoice;
  reason: string;
};

export function parseAndroidMinVersionCode(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function parseAndroidImmediateUpdateFlag(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function shouldPreferImmediateUpdate(args: {
  installedVersionCode: number | null | undefined;
  policy: AndroidUpdateServerPolicy;
}): boolean {
  if (args.policy.androidImmediateUpdate) return true;
  const min = args.policy.androidMinVersionCode;
  const installed = args.installedVersionCode;
  if (min == null || installed == null) return false;
  if (!Number.isFinite(min) || !Number.isFinite(installed)) return false;
  return installed < min;
}

/**
 * Decide what flow to start. Never loops forever — caller must apply cooldown / cancel caps.
 */
export function decideAndroidPlayUpdateFlow(args: {
  info: AndroidPlayUpdateInfo;
  policy: AndroidUpdateServerPolicy;
  /** When true, skip starting any UI flow (call / critical work). */
  blockUi: boolean;
}): AndroidUpdateFlowDecision {
  const { info, policy, blockUi } = args;

  if (info.installStatus === "DOWNLOADED") {
    if (blockUi || info.callInProgress) {
      return { choice: "none", reason: "downloaded_but_ui_blocked" };
    }
    return { choice: "complete_flexible", reason: "flexible_downloaded" };
  }

  if (info.updateAvailability === "UPDATE_NOT_AVAILABLE") {
    return { choice: "none", reason: "update_not_available" };
  }

  if (
    info.updateAvailability !== "UPDATE_AVAILABLE" &&
    info.updateAvailability !== "DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS"
  ) {
    return { choice: "none", reason: "update_availability_unknown_or_other" };
  }

  if (blockUi || info.callInProgress) {
    return { choice: "none", reason: "ui_blocked" };
  }

  const preferImmediate = shouldPreferImmediateUpdate({
    installedVersionCode: info.installedVersionCode,
    policy,
  });

  if (preferImmediate) {
    if (info.immediateAllowed) {
      return { choice: "immediate", reason: "server_policy_immediate" };
    }
    // Safe recovery: never permanently block the app when IMMEDIATE is unavailable.
    if (info.flexibleAllowed) {
      return { choice: "flexible", reason: "immediate_unavailable_fallback_flexible" };
    }
    return { choice: "none", reason: "immediate_required_but_play_unavailable" };
  }

  if (info.flexibleAllowed) {
    return { choice: "flexible", reason: "default_flexible" };
  }

  if (info.immediateAllowed) {
    // Play only offers IMMEDIATE — still do not force without policy; skip auto prompt.
    return { choice: "none", reason: "only_immediate_allowed_without_policy" };
  }

  return { choice: "none", reason: "no_allowed_update_type" };
}

export type AndroidVersionFreshness =
  | "latest"
  | "update_available"
  | "check_failed"
  | "unavailable"
  | "unknown";

/**
 * UI freshness label — never claim "latest" when Play status cannot be confirmed.
 */
export function resolveAndroidVersionFreshness(args: {
  platformIsAndroidNative: boolean;
  updateInfo: AndroidPlayUpdateInfo | null;
  checkError: string | null;
}): AndroidVersionFreshness {
  if (!args.platformIsAndroidNative) return "unavailable";
  if (args.checkError) return "check_failed";
  if (!args.updateInfo) return "unknown";
  const avail = args.updateInfo.updateAvailability;
  if (avail === "UPDATE_AVAILABLE" || avail === "DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS") {
    return "update_available";
  }
  if (avail === "UPDATE_NOT_AVAILABLE") return "latest";
  return "unknown";
}
