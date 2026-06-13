"use client";

import { registerPlugin } from "@capacitor/core";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

export type OAuthTabPlugin = {
  open(options: { url: string }): Promise<void>;
};

const OAuthTab = registerPlugin<OAuthTabPlugin>("OAuthTab");

function startError(code: string, message?: string): Error {
  const err = new Error(message || code);
  err.name = code;
  return err;
}

async function openWithCapacitorBrowser(url: string): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url });
}

function openWithAnchor(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Native OAuth Custom Tab — OAuthTab(직접 CustomTabsIntent) → Browser → anchor 순 fallback.
 */
export async function openNativeOAuthTab(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw startError("oauth_start_failed", "OAuth URL is empty.");
  }

  if (isCapacitorNativePlatform()) {
    try {
      await OAuthTab.open({ url: trimmed });
      return;
    } catch {
      // OAuthTab unavailable before APK rebuild — fall through.
    }
  }

  try {
    await openWithCapacitorBrowser(trimmed);
    return;
  } catch {
    try {
      openWithAnchor(trimmed);
      return;
    } catch {
      throw startError("browser_open_rejected", "OAuth browser could not be opened.");
    }
  }
}
