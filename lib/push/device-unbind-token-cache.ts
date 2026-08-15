"use client";

/**
 * Last successfully registered push token — logout ownership proof when session is already gone.
 * Cleared after successful deactivate. Not a second SSOT for delivery; only unbind evidence.
 */

export const DIBAY_DEVICE_UNBIND_PUSH_TOKEN_KEY = "dibay:device_unbind_push_token";
export const DIBAY_DEVICE_UNBIND_PUSH_PROVIDER_KEY = "dibay:device_unbind_push_provider";

function readLs(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeLs(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function cacheDeviceUnbindPushToken(pushToken: string, pushProvider = "fcm"): void {
  const token = String(pushToken ?? "").trim();
  if (!token) return;
  writeLs(DIBAY_DEVICE_UNBIND_PUSH_TOKEN_KEY, token);
  writeLs(DIBAY_DEVICE_UNBIND_PUSH_PROVIDER_KEY, String(pushProvider ?? "fcm").trim().toLowerCase() || "fcm");
}

export function readDeviceUnbindPushToken(): { pushToken: string; pushProvider: string } | null {
  const pushToken = readLs(DIBAY_DEVICE_UNBIND_PUSH_TOKEN_KEY)?.trim() ?? "";
  if (!pushToken) return null;
  const pushProvider =
    readLs(DIBAY_DEVICE_UNBIND_PUSH_PROVIDER_KEY)?.trim().toLowerCase() || "fcm";
  return { pushToken, pushProvider };
}

export function clearDeviceUnbindPushToken(): void {
  removeLs(DIBAY_DEVICE_UNBIND_PUSH_TOKEN_KEY);
  removeLs(DIBAY_DEVICE_UNBIND_PUSH_PROVIDER_KEY);
}
