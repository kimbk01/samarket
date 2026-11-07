"use client";

import { useSyncExternalStore } from "react";
import { isAppleIapNativeAvailable } from "@/lib/apple-iap/native-storekit-bridge";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import {
  isIosAppPointChargeClient,
  readDibayAppMarkerCookie,
  resolvePointChargeMode,
  type PointChargeMode,
} from "@/lib/points/ios-point-charge-gate";

const noopSubscribe = () => () => undefined;

function currentMode(): PointChargeMode {
  const shell = isCapacitorNativePlatform() ? (resolveCapacitorShellPlatform() ?? "web") : "web";
  let cookie = "";
  try {
    cookie = document.cookie;
  } catch {
    cookie = "";
  }
  const iosApp = isIosAppPointChargeClient({
    shell,
    markerCookie: readDibayAppMarkerCookie(cookie),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  });
  return resolvePointChargeMode({ iosApp, storeKitAvailable: isAppleIapNativeAvailable() });
}

/** D-07: 충전 화면 방식 — apple(StoreKit) · ios_update_required(iOS 앱 구 빌드) · bank(Android·웹). SSR = bank */
export function usePointChargeMode(): PointChargeMode {
  return useSyncExternalStore(noopSubscribe, currentMode, () => "bank");
}
