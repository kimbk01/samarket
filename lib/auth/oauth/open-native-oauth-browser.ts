"use client";

import type { OAuthProvider } from "@/lib/auth/auth-providers";

export const NATIVE_OAUTH_BROWSER_OPEN_TIMEOUT_MS = 20_000;

type CapacitorWindow = Window & {
  Capacitor?: {
    Plugins?: {
      Browser?: {
        open: (options: { url: string }) => Promise<void>;
      };
    };
    isNativePlatform?: () => boolean;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForCapacitorBridge(maxMs = 5_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const cap = (window as CapacitorWindow).Capacitor;
    if (cap?.Plugins?.Browser || cap?.isNativePlatform?.()) {
      return;
    }
    await sleep(50);
  }
}

async function didExternalAuthSurfaceOpen(): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (document.visibilityState === "hidden") {
      return true;
    }
    await sleep(100);
  }
  return false;
}

async function openWithBrowserPlugin(url: string): Promise<boolean> {
  try {
    const { Browser } = await import("@capacitor/browser");
    let pageLoaded = false;
    const listener = await Browser.addListener("browserPageLoaded", () => {
      pageLoaded = true;
    });

    try {
      await Browser.open({ url });
      if (pageLoaded) return true;
      return didExternalAuthSurfaceOpen();
    } finally {
      await listener.remove();
    }
  } catch {
    return false;
  }
}

async function openWithCapacitorGlobal(url: string): Promise<boolean> {
  try {
    const browser = (window as CapacitorWindow).Capacitor?.Plugins?.Browser;
    if (!browser?.open) return false;
    await browser.open({ url });
    return didExternalAuthSurfaceOpen();
  } catch {
    return false;
  }
}

function openWithWindowFallback(url: string): boolean {
  try {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) return true;
  } catch {
    // fall through
  }

  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}

export async function openNativeOAuthBrowser(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("missing_authorize_url");
  }

  await waitForCapacitorBridge();

  if (await openWithBrowserPlugin(trimmed)) return;
  if (await openWithCapacitorGlobal(trimmed)) return;
  if (openWithWindowFallback(trimmed)) return;

  throw new Error("browser_open_failed");
}

export function isNativeOAuthProvider(value: string | null | undefined): value is OAuthProvider {
  return value === "google" || value === "kakao" || value === "apple";
}
