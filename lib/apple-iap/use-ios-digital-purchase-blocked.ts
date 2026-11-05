"use client";

import { useSyncExternalStore } from "react";
import { DIBAY_SHELL_HEADER } from "@/lib/apple-iap/ios-digital-purchase-contract";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

function currentShell(): "ios" | "android" | "web" {
  if (!isCapacitorNativePlatform()) return "web";
  return resolveCapacitorShellPlatform() ?? "web";
}

/** Cash 결제 요청에 붙이는 셸 헤더 (서버는 쿠키·UA 와 함께 판별) */
export function dibayShellRequestHeaders(): Record<string, string> {
  return { [DIBAY_SHELL_HEADER]: currentShell() };
}

const noopSubscribe = () => () => undefined;

/** iOS 앱이면 Cash 결제 CTA 를 숨긴다 (SSR·웹·Android = false) */
export function useIosAppDigitalPurchaseBlocked(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => currentShell() === "ios",
    () => false
  );
}
