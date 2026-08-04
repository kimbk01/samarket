"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { MessageKey } from "@/lib/i18n/messages";
import { NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS } from "@/lib/auth/oauth/native-oauth-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import {
  getCapacitorNativeDiagnostics,
  isCapacitorBridgeReady,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

export type NativeOAuthLaunchMethod = "custom_tabs" | "as_web_authentication_session";

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
  | "activity_not_found"
  | "capacitor_bridge_not_ready"
  | "presentation_anchor_missing"
  | "as_web_auth_failed"
  | "oauth_launcher_cancelled"
  | "oauth_session_in_progress"
  | "invalid_url"
  | "unknown_native_error";

export type NativeOAuthOpenErrorCode =
  | "oauth_launcher_unavailable"
  | "oauth_tab_open_failed"
  | "oauth_bridge_not_ready"
  | "oauth_custom_tabs_unavailable"
  | "oauth_launcher_cancelled"
  | "oauth_presentation_unavailable";

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
  if (code === "oauth_bridge_not_ready") {
    return "auth_err_oauth_bridge_not_ready";
  }
  if (code === "oauth_custom_tabs_unavailable") {
    return "auth_err_oauth_custom_tabs_required";
  }
  if (code === "oauth_launcher_unavailable") {
    return "auth_err_oauth_browser_plugin_unavailable";
  }
  if (code === "oauth_launcher_cancelled") {
    return "auth_err_oauth_start_failed";
  }
  if (code === "oauth_presentation_unavailable") {
    return "auth_err_oauth_browser_open_failed";
  }
  return "auth_err_oauth_browser_open_failed";
}

/** User dismissed ASWebAuthenticationSession / Custom Tab flow before callback. */
export function isNativeOAuthLauncherCancelError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.name?.trim() || "";
  if (name === "oauth_launcher_cancelled" || name === "user_cancelled") return true;
  const nativeErr = err as NativeOAuthOpenError;
  return nativeErr.devCode === "oauth_launcher_cancelled";
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
    normalized.includes("oauth_launcher_cancelled")
    || normalized.includes("canceledlogin")
    || normalized === "cancelled"
    || normalized === "canceled"
  ) {
    return "oauth_launcher_cancelled";
  }
  if (
    normalized.includes("unimplemented")
    || normalized.includes("not implemented")
    || normalized.includes("plugin is not implemented")
    || normalized.includes("plugin not found")
    || normalized.includes("implementation unavailable")
  ) {
    return "plugin_not_implemented";
  }
  if (normalized.includes("activity_not_found") || normalized.includes("no_activity")) {
    return "activity_not_found";
  }
  if (normalized.includes("presentation_anchor_missing") || normalized.includes("as_web_auth_start_failed")) {
    return "presentation_anchor_missing";
  }
  if (
    normalized.includes("as_web_auth_failed")
    || normalized.includes("oauth_callback_url_missing")
    || normalized.includes("oauth_callback_scheme_mismatch")
  ) {
    return "as_web_auth_failed";
  }
  if (normalized.includes("oauth_session_in_progress")) {
    return "oauth_session_in_progress";
  }
  if (normalized.includes("missing_url") || normalized.includes("invalid_url")) {
    return "invalid_url";
  }
  if (normalized.includes("custom_tabs_unavailable") || normalized.includes("custom_tabs")) {
    return "custom_tabs_failed";
  }
  return "unknown_native_error";
}

function mapRejectToUserCode(devCode: NativeOAuthDevErrorCode): NativeOAuthOpenErrorCode {
  if (devCode === "capacitor_bridge_not_ready") {
    return "oauth_bridge_not_ready";
  }
  if (devCode === "custom_tabs_failed") {
    return "oauth_custom_tabs_unavailable";
  }
  if (devCode === "oauth_launcher_cancelled") {
    return "oauth_launcher_cancelled";
  }
  if (devCode === "presentation_anchor_missing") {
    return "oauth_presentation_unavailable";
  }
  if (devCode === "plugin_not_implemented" || devCode === "activity_not_found") {
    return "oauth_launcher_unavailable";
  }
  return "oauth_tab_open_failed";
}

function isValidNativeOAuthLaunchResult(result: NativeOAuthLaunchResult | null | undefined): boolean {
  if (!result?.opened) return false;
  return result.method === "custom_tabs" || result.method === "as_web_authentication_session";
}

async function ensureCapacitorBridgeReadyForOpen(): Promise<void> {
  if (isCapacitorBridgeReady()) {
    logOAuthNativeEvent("bridge_wait_result", { ready: true, immediate: true });
    return;
  }

  const ready = await waitForCapacitorBridgeReady({ timeoutMs: NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS });
  logOAuthNativeEvent("bridge_wait_result", {
    ready,
    immediate: false,
    diagnostics: getCapacitorNativeDiagnostics(),
  });

  if (!ready || !isCapacitorBridgeReady()) {
    throw nativeOAuthOpenError(
      "oauth_bridge_not_ready",
      "capacitor_bridge_not_ready",
      "Capacitor native bridge is not ready.",
    );
  }
}

/** Native OAuth launcher — NativeOAuthLauncher.open 단일 경로 (Custom Tab only). */
export async function openNativeOAuthTab(url: string): Promise<NativeOAuthLaunchResult> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw nativeOAuthOpenError(
      "oauth_tab_open_failed",
      "unknown_native_error",
      "OAuth URL is empty.",
    );
  }

  logOAuthNativeEvent("before_open", {
    urlLen: trimmed.length,
    diagnostics: getCapacitorNativeDiagnostics(),
  });

  await ensureCapacitorBridgeReadyForOpen();

  try {
    const result = await NativeOAuthLauncher.open({ url: trimmed });
    if (isValidNativeOAuthLaunchResult(result)) {
      logOAuthNativeEvent("after_open", { method: result.method, opened: result.opened });
      return result;
    }

    throw nativeOAuthOpenError(
      "oauth_tab_open_failed",
      "unknown_native_error",
      "NativeOAuthLauncher returned invalid result.",
    );
  } catch (err) {
    if (err instanceof Error && "devCode" in err) {
      logOAuthNativeEvent("open_throw", { code: err.name, devCode: (err as NativeOAuthOpenError).devCode });
      throw err;
    }
    const rejectText = normalizeCapacitorRejectCode(err);
    const devCode = mapRejectToDevCode(rejectText);
    logOAuthNativeEvent("open_throw", { devCode, rejectText });
    throw nativeOAuthOpenError(
      mapRejectToUserCode(devCode),
      devCode,
      rejectText || "NativeOAuthLauncher.open failed",
    );
  }
}
