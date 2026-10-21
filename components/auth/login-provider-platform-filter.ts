"use client";

import { useSyncExternalStore } from "react";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import type { OAuthNativeRoutingDecision } from "@/lib/auth/oauth/oauth-native-routing";
import {
  isNativeAppOAuthShell,
  resolveOAuthProviderRoutingSnapshot,
} from "@/lib/auth/oauth/oauth-provider-routing.client";
import {
  isCapacitorBridgeReady,
  resolveOAuthRoutingShellPlatform,
  waitForCapacitorBridgeReady,
  type DibayAppPlatform,
} from "@/lib/platform/capacitor-native";

/** 버튼 노출 대상 — Naver(서버 비활성 예정)·Facebook(start 미연결)은 절대 노출하지 않는다. */
const LOGIN_BUTTON_PROVIDERS = new Set<OAuthProvider>(["google", "kakao", "apple"]);

/** 버튼 목록 확정 전 bridge 대기 상한 — 이후에는 현재 감지값으로 렌더한다. */
const LOGIN_PROVIDER_BRIDGE_WAIT_MS = 2_000;

export type LoginProviderPlatformFilterResult = {
  providers: AuthProviderPublic[];
  /** iOS 셸인데 Apple 이 목록에 없어 소셜 버튼을 모두 숨겼다 (App Store 4.8). */
  iosAppleMissing: boolean;
};

/**
 * P1-14 (UX-03, UX-04): 플랫폼별 로그인 버튼 필터 — 순수 함수.
 * 1) google/kakao/apple 만 노출
 * 2) routing 이 `native_blocked` 인 공급자는 숨긴다 (눌러도 진행 경로 없음)
 * 3) iOS 셸에서 Apple 이 남지 않으면 다른 소셜 버튼도 숨긴다 (내부 로그인만)
 */
export function filterLoginProvidersForPlatform(
  providers: AuthProviderPublic[],
  opts: {
    shellPlatform: DibayAppPlatform | null;
    resolveRoutingAction: (provider: OAuthProvider) => OAuthNativeRoutingDecision["action"];
  },
): LoginProviderPlatformFilterResult {
  const routable = providers.filter(
    (row) =>
      LOGIN_BUTTON_PROVIDERS.has(row.provider) && opts.resolveRoutingAction(row.provider) !== "native_blocked",
  );
  if (opts.shellPlatform === "ios" && routable.length > 0 && !routable.some((row) => row.provider === "apple")) {
    return { providers: [], iosAppleMissing: true };
  }
  return { providers: routable, iosAppleMissing: false };
}

type PlatformSnapshot = { ready: boolean; platformAware: boolean };

/** SSR·hydration 첫 렌더 — 플랫폼 감지 없이 렌더 (hydration 불일치 방지). */
const SERVER_SNAPSHOT: PlatformSnapshot = { ready: true, platformAware: false };
const CLIENT_READY: PlatformSnapshot = { ready: true, platformAware: true };
const CLIENT_WAITING: PlatformSnapshot = { ready: false, platformAware: true };

let bridgeSettled = false;
let bridgeWaitStarted = false;
const listeners = new Set<() => void>();

function needsBridgeBeforeRender(): boolean {
  return isNativeAppOAuthShell() || resolveOAuthRoutingShellPlatform() === "ios";
}

function getClientSnapshot(): PlatformSnapshot {
  if (bridgeSettled) return CLIENT_READY;
  if (!needsBridgeBeforeRender() || isCapacitorBridgeReady()) {
    bridgeSettled = true;
    return CLIENT_READY;
  }
  return CLIENT_WAITING;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!bridgeSettled && !bridgeWaitStarted && getClientSnapshot() === CLIENT_WAITING) {
    bridgeWaitStarted = true;
    void waitForCapacitorBridgeReady({ timeoutMs: LOGIN_PROVIDER_BRIDGE_WAIT_MS })
      .catch(() => false)
      .then(() => {
        bridgeSettled = true;
        for (const l of listeners) l();
      });
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Capacitor bridge 준비 후 플랫폼 필터 결과 — 준비 전에는 `ready=false` (버튼 깜빡임 방지). */
export function usePlatformFilteredLoginProviders(providers: AuthProviderPublic[]): {
  ready: boolean;
  providers: AuthProviderPublic[];
} {
  const snapshot = useSyncExternalStore(subscribe, getClientSnapshot, () => SERVER_SNAPSHOT);
  if (!snapshot.ready) return { ready: false, providers: [] };
  if (!snapshot.platformAware) {
    return {
      ready: true,
      providers: providers.filter((row) => LOGIN_BUTTON_PROVIDERS.has(row.provider)),
    };
  }
  const shellPlatform = resolveOAuthRoutingShellPlatform();
  const result = filterLoginProvidersForPlatform(providers, {
    shellPlatform,
    resolveRoutingAction: (provider) =>
      resolveOAuthProviderRoutingSnapshot(provider, { shellPlatform }).routing.action,
  });
  if (result.iosAppleMissing) {
    warnIosAppleMissingOnce();
  }
  return { ready: true, providers: result.providers };
}

let iosAppleWarned = false;
function warnIosAppleMissingOnce(): void {
  if (iosAppleWarned) return;
  iosAppleWarned = true;
  console.warn(
    "[auth-login] iOS shell: Apple sign-in is not enabled/available — social buttons hidden (App Store 4.8). Enable Apple in admin auth providers.",
  );
}
