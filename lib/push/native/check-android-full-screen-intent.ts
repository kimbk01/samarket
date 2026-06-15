"use client";

import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import { logPushRegister } from "@/lib/push/native/native-push-register-log";

const FSI_PROMPT_SESSION_KEY = "dibay_fsi_settings_prompted";

async function invokeFullScreenIntentPlugin<T>(
  method: "checkFullScreenIntent" | "openFullScreenIntentSettings",
): Promise<T> {
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: {
      nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown>;
    };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise !== "function") {
    throw new Error("Native bridge unavailable");
  }
  return nativePromise("NativeDevicePermissions", method, {}) as Promise<T>;
}

/** Android 14+ full-screen incoming call intent capability. */
export async function checkAndroidFullScreenIntentGranted(): Promise<boolean | null> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") return null;
  try {
    const result = await invokeFullScreenIntentPlugin<{ granted?: boolean }>("checkFullScreenIntent");
    return Boolean(result.granted);
  } catch {
    return null;
  }
}

/** One-shot settings nudge when FSI is blocked (sessionStorage gate). */
export async function promptAndroidFullScreenIntentSettingsIfNeeded(): Promise<void> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") return;
  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(FSI_PROMPT_SESSION_KEY) === "1") {
    return;
  }
  const granted = await checkAndroidFullScreenIntentGranted();
  if (granted !== false) return;
  try {
    await invokeFullScreenIntentPlugin<{ opened?: boolean }>("openFullScreenIntentSettings");
    sessionStorage.setItem(FSI_PROMPT_SESSION_KEY, "1");
    logPushRegister("full_screen_intent_settings_opened", {});
  } catch {
    /* ignore */
  }
}
