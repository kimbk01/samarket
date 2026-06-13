"use client";

import { registerPlugin } from "@capacitor/core";
import type { MessageKey } from "@/lib/i18n/messages";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

export type OAuthTabPlugin = {
  open(options: { url: string }): Promise<void>;
};

const OAuthTab = registerPlugin<OAuthTabPlugin>("OAuthTab");

export type NativeOAuthOpenErrorCode =
  | "oauth_tab_unavailable"
  | "custom_tabs_unavailable"
  | "oauth_tab_open_failed";

function nativeOAuthOpenError(code: NativeOAuthOpenErrorCode, message?: string): Error {
  const err = new Error(message || code);
  err.name = code;
  return err;
}

function normalizeCapacitorRejectCode(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    const message = String(record.message ?? "").trim();
    const code = String(record.code ?? "").trim();
    return (message || code).toLowerCase();
  }
  return String(raw).trim().toLowerCase();
}

export function mapNativeOAuthOpenErrorToMessageKey(code: string): MessageKey {
  if (code === "oauth_tab_unavailable") return "auth_err_oauth_browser_plugin_unavailable";
  if (code === "custom_tabs_unavailable") return "auth_err_oauth_custom_tabs_required";
  return "auth_err_oauth_browser_open_failed";
}

function mapCapacitorRejectToErrorCode(rejectText: string): NativeOAuthOpenErrorCode {
  const normalized = rejectText.toLowerCase();
  if (
    normalized.includes("unimplemented")
    || normalized.includes("not implemented")
    || normalized.includes("plugin is not implemented")
    || normalized.includes("oauth tab")
    || normalized.includes("missing_url")
    || normalized.includes("no_activity")
  ) {
    return "oauth_tab_unavailable";
  }
  if (normalized.includes("custom_tabs_unavailable")) {
    return "custom_tabs_unavailable";
  }
  return "oauth_tab_open_failed";
}

/**
 * Native OAuth Custom Tab — OAuthTab.open 단일 경로. silent fallback 금지.
 */
export async function openNativeOAuthTab(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw nativeOAuthOpenError("oauth_tab_open_failed", "OAuth URL is empty.");
  }

  if (!isCapacitorNativePlatform()) {
    throw nativeOAuthOpenError("oauth_tab_unavailable", "OAuthTab is only available on native platforms.");
  }

  try {
    await OAuthTab.open({ url: trimmed });
  } catch (err) {
    const rejectText = normalizeCapacitorRejectCode(err);
    throw nativeOAuthOpenError(mapCapacitorRejectToErrorCode(rejectText), rejectText || "OAuthTab.open failed");
  }
}
