"use client";

type BrowserWithConnection = typeof window & {
  navigator: Navigator & {
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
    };
  };
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function isConstrainedNetwork(): boolean {
  if (typeof window === "undefined") return false;
  const browser = window as BrowserWithConnection;
  const connection = browser.navigator.connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
}

export function scheduleWhenBrowserIdle(callback: () => void, timeout = 1200): number {
  if (typeof window === "undefined") return -1;
  const browser = window as BrowserWithConnection;
  if (typeof browser.requestIdleCallback === "function") {
    return browser.requestIdleCallback(callback, { timeout });
  }
  return window.setTimeout(callback, Math.min(timeout, 400));
}

export function cancelScheduledWhenBrowserIdle(id: number): void {
  if (typeof window === "undefined" || id < 0) return;
  const browser = window as BrowserWithConnection;
  if (typeof browser.cancelIdleCallback === "function") {
    browser.cancelIdleCallback(id);
    return;
  }
  window.clearTimeout(id);
}
