"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  getCapacitorNativeDiagnostics,
  isCapacitorBridgeReady,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";

export type NativeOAuthLaunchMethod = "custom_tabs";

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
  | "unknown_native_error";

export type NativeOAuthOpenErrorCode =
  | "oauth_launcher_unavailable"
  | "oauth_tab_open_failed"
  | "oauth_bridge_not_ready"
  | "oauth_custom_tabs_unavailable";

export type NativeOAuthOpenError = Error & {
  devCode: NativeOAuthDevErrorCode;
  rawDetail: string;
};

const NativeOAuthLauncher = registerPlugin<NativeOAuthLauncherPlugin>("NativeOAuthLauncher");

const BRIDGE_READY_TIMEOUT_MS = 3_000;

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
    || normalized.includes("implementation unavailable")
  ) {
    return "plugin_not_implemented";
  }
  if (normalized.includes("activity_not_found") || normalized.includes("no_activity")) {
    return "activity_not_found";
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
  if (devCode === "plugin_not_implemented" || devCode === "activity_not_found") {
    return "oauth_launcher_unavailable";
  }
  return "oauth_tab_open_failed";
}

async function ensureCapacitorBridgeReadyForOpen(): Promise<void> {
  const diagnosticsBeforeWait = getCapacitorNativeDiagnostics();
  console.error("[oauth] bridge_wait_start", diagnosticsBeforeWait);

  if (isCapacitorBridgeReady()) {
    console.error("[oauth] bridge_ready_immediate", diagnosticsBeforeWait);
    return;
  }

  const ready = await waitForCapacitorBridgeReady({ timeoutMs: BRIDGE_READY_TIMEOUT_MS });
  const diagnosticsAfterWait = getCapacitorNativeDiagnostics();
  console.error("[oauth] bridge_wait_result", { ready, diagnostics: diagnosticsAfterWait });

  if (!ready || !isCapacitorBridgeReady()) {
    throw nativeOAuthOpenError(
      "oauth_bridge_not_ready",
      "capacitor_bridge_not_ready",
      "Capacitor native bridge is not ready.",
    );
  }
}

/**
 * Native OAuth launcher — NativeOAuthLauncher.open 단일 경로.
 */
export async function openNativeOAuthTab(url: string): Promise<NativeOAuthLaunchResult> {
  const trimmed = url.trim();
  const diagnostics = getCapacitorNativeDiagnostics();
  console.error("[oauth] before_open", {
    urlLen: trimmed.length,
    openAttempt: true,
    diagnostics,
  });

  if (!trimmed) {
    console.error("[oauth] open_throw", "empty_url");
    throw nativeOAuthOpenError(
      "oauth_tab_open_failed",
      "unknown_native_error",
      "OAuth URL is empty.",
    );
  }

  try {
    await ensureCapacitorBridgeReadyForOpen();
  } catch (err) {
    console.error("[oauth] open_throw", err);
    throw err;
  }

  const pluginAvailable = Capacitor.isPluginAvailable("NativeOAuthLauncher");
  if (pluginAvailable) {
    console.error("[oauth] plugin_available", { plugin: "NativeOAuthLauncher" });
  } else {
    console.error("[oauth] plugin_unavailable", { plugin: "NativeOAuthLauncher" });
  }

  console.error("[oauth] before_native_launcher", getCapacitorNativeDiagnostics());

  try {
    const result = await NativeOAuthLauncher.open({ url: trimmed });
    console.error("[oauth] after_native_launcher", result);
    console.error("[oauth] after_open", {
      method: result?.method,
      opened: result?.opened,
      externalBrowserExpected: true,
      successCriteria: "dibay://auth/callback app return + session exchange",
    });

    if (result?.opened && result.method === "custom_tabs") {
      return result;
    }

    console.error("[oauth] open_throw", "invalid_native_launcher_result");
    throw nativeOAuthOpenError(
      "oauth_tab_open_failed",
      "unknown_native_error",
      "NativeOAuthLauncher returned invalid result.",
    );
  } catch (err) {
    console.error("[oauth] open_throw", err);
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
