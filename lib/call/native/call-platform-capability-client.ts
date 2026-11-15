"use client";

import { dibayVoipCallPlugin } from "@/lib/push/native/dibay-voip-call-plugin";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/**
 * D2-1·D2-3 (docs/audit/mac-ipad-call-and-bottom-bar-audit-2026-11-15.md §10) — 네이티브 통화 플랫폼 능력 단일 읽기.
 * 네이티브 단일 정의 `DibayCallPlatformCapability` 를 그대로 받는다. iOS 셸에서만 조회하고, 메서드가 없는
 * 구 바이너리·iPhone·iPad·Android·웹은 `iosAppOnMac=false` (기존 경로).
 * 웹에서 판정값을 읽는 곳은 이 파일 하나뿐 — `dibayVoipCallPlugin.getCallPlatformCapability` 를 다른 곳에서 직접 부르지 않는다
 * (소스 계약 테스트 `call-platform-capability-single-reader.test.ts`).
 */
export type CallPlatformCapability = {
  iosAppOnMac: boolean;
  voipPush: boolean;
  callKitCallUi: boolean;
};

const DEFAULT_CAPABILITY: CallPlatformCapability = {
  iosAppOnMac: false,
  voipPush: true,
  callKitCallUi: true,
};

let cached: CallPlatformCapability | null = null;
let inflight: Promise<CallPlatformCapability> | null = null;

export function loadCallPlatformCapability(): Promise<CallPlatformCapability> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "ios") {
    cached = DEFAULT_CAPABILITY;
    return Promise.resolve(cached);
  }
  inflight = dibayVoipCallPlugin
    .getCallPlatformCapability()
    .then((cap) => ({
      iosAppOnMac: cap?.iosAppOnMac === true,
      voipPush: cap?.voipPush !== false,
      callKitCallUi: cap?.callKitCallUi !== false,
    }))
    .catch(() => DEFAULT_CAPABILITY)
    .then((cap) => {
      cached = cap;
      inflight = null;
      return cap;
    });
  return inflight;
}

/** 동기 읽기 — `loadCallPlatformCapability` 가 끝나기 전에는 false (기존 경로). */
export function isIosAppOnMacCached(): boolean {
  return cached?.iosAppOnMac === true;
}

export function resetCallPlatformCapabilityForTests(value?: CallPlatformCapability | null): void {
  cached = value ?? null;
  inflight = null;
}
