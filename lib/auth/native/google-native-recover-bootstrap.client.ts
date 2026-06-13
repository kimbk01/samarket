"use client";

import { App } from "@capacitor/app";
import { recoverNativeGoogleLoginIfPending } from "@/lib/auth/native/start-native-google-login.client";
import { NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS } from "@/lib/auth/oauth/native-oauth-contract";
import { isNativeGoogleLoginAvailable, waitForCapacitorBridgeReady } from "@/lib/platform/capacitor-native";

let googleNativeRecoverBootstrapRegistered = false;

async function tryRecoverGoogleNativeLogin(): Promise<void> {
  if (!isNativeGoogleLoginAvailable()) return;
  const ready = await waitForCapacitorBridgeReady({
    timeoutMs: NATIVE_OAUTH_BRIDGE_READY_TIMEOUT_MS,
  }).catch(() => false);
  if (!ready) return;
  await recoverNativeGoogleLoginIfPending().catch(() => false);
}

/** Google 계정 UI 복귀·프로세스 재시작 후 exchange pending 을 앱 전역에서 복구한다. */
export function registerGoogleNativeRecoverBootstrap(): void {
  if (typeof window === "undefined" || googleNativeRecoverBootstrapRegistered) return;
  googleNativeRecoverBootstrapRegistered = true;

  void tryRecoverGoogleNativeLogin();

  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void tryRecoverGoogleNativeLogin();
  }).catch(() => undefined);

  const onVisible = () => {
    if (document.visibilityState === "visible") void tryRecoverGoogleNativeLogin();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onVisible);
}
