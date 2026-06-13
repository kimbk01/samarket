"use client";

import { registerPlugin } from "@capacitor/core";
import type { MessageKey } from "@/lib/i18n/messages";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

export type NativeOAuthLaunchMethod = "custom_tabs" | "action_view";

export type NativeOAuthLaunchResult = {
  opened: boolean;
  method: NativeOAuthLaunchMethod;
};

export type NativeOAuthLauncherPlugin = {
  open(options: { url: string }): Promise<NativeOAuthLaunchResult>;
};

export type NativeOAuthDevErrorCode =
  | "plugin_not_implemented"
  | "custom_tabs_failed"
  | "action_view_failed"
  | "activity_not_found"
  | "unknown_native_error";

export type NativeOAuthOpenErrorCode = "oauth_launcher_unavailable" | "oauth_tab_open_failed";

export type NativeOAuthOpenError = Error & {
  devCode: NativeOAuthDevErrorCode;
  rawDetail: string;
};

const NativeOAuthLauncher = registerPlugin<NativeOAuthLauncherPlugin>("NativeOAuthLauncher");

function nativeOAuthOpenError(
  userCode: NativeOAuthOpenErrorCode,
  devCode: NativeOAuthDevErrorCode,
  rawDetail: string,
): NativeOAuthOpenError {
  const err = new Error(rawDetail || devCode) as NativeOAuthOpenError;
  err.name = userCode;
  err.devCode = devCode;
  err.rawDetail = rawDetail || devCode;
  return err;
}

function normalizeCapacitorRejectCode(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    const message = String(record.message ?? "").trim();
    const code = String(record.code ?? "").trim();
    return message || code;
  }
  return String(raw).trim();
}

export function mapNativeOAuthOpenErrorToMessageKey(code: string): MessageKey {
  if (code === "oauth_launcher_unavailable" || code === "oauth_tab_unavailable") {
    return "auth_err_oauth_browser_plugin_unavailable";
  }
  return "auth_err_oauth_browser_open_failed";
}

export function formatNativeOAuthDevError(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const nativeErr = err as NativeOAuthOpenError;
  if (nativeErr.devCode) {
    return `${nativeErr.devCode}: ${nativeErr.rawDetail || nativeErr.message}`;
  }
  const raw = normalizeCapacitorRejectCode(err);
  if (!raw) return null;
  return `unknown_native_error: ${raw}`;
}

function mapRejectToDevCode(rejectText: string): NativeOAuthDevErrorCode {
  const normalized = rejectText.toLowerCase();
  if (
    normalized.includes("unimplemented")
    || normalized.includes("not implemented")
    || normalized.includes("plugin is not implemented")
    || normalized.includes("plugin not found")
  ) {
    return "plugin_not_implemented";
  }
  if (normalized.includes("activity_not_found") || normalized.includes("no_activity")) {
    return "activity_not_found";
  }
  if (normalized.includes("browser_open_failed")) {
    return "action_view_failed";
  }
  if (normalized.includes("custom_tabs")) {
    return "custom_tabs_failed";
  }
  return "unknown_native_error";
}

function mapRejectToUserCode(devCode: NativeOAuthDevErrorCode): NativeOAuthOpenErrorCode {
  if (devCode === "plugin_not_implemented" || devCode === "activity_not_found") {
    return "oauth_launcher_unavailable";
  }
  return "oauth_tab_open_failed";
}

function logNativeOAuthLaunchMethod(method: NativeOAuthLaunchMethod): void {
  console.info("[oauth] native_launcher_open", { method });
}

/**
 * Native OAuth launcher — NativeOAuthLauncher.open (ACTION_VIEW → Custom Tab).
 */
export async function openNativeOAuthTab(url: string): Promise<NativeOAuthLaunchResult> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw nativeOAuthOpenError(
      "oauth_tab_open_failed",
      "unknown_native_error",
      "OAuth URL is empty.",
    );
  }

  if (!isCapacitorNativePlatform()) {
    throw nativeOAuthOpenError(
      "oauth_launcher_unavailable",
      "plugin_not_implemented",
      "NativeOAuthLauncher is only available on native platforms.",
    );
  }

  try {
    const result = await NativeOAuthLauncher.open({ url: trimmed });
    if (result?.opened && (result.method === "custom_tabs" || result.method === "action_view")) {
      logNativeOAuthLaunchMethod(result.method);
      return result;
    }
    throw nativeOAuthOpenError(
      "oauth_tab_open_failed",
      "unknown_native_error",
      "NativeOAuthLauncher returned invalid result.",
    );
  } catch (err) {
    if (err instanceof Error && "devCode" in err) {
      throw err;
    }
    const rejectText = normalizeCapacitorRejectCode(err);
    const devCode = mapRejectToDevCode(rejectText);
    throw nativeOAuthOpenError(
      mapRejectToUserCode(devCode),
      devCode,
      rejectText || "NativeOAuthLauncher.open failed",
    );
  }
}
