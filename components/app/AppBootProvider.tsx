"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  cancelAppBootBackgroundHydration,
} from "@/lib/app-boot/schedule-app-boot-background";
import { invalidateAppBootProfileCache } from "@/lib/app-boot/fetch-app-boot-profile";
import {
  markAppBootAuthUpgradePending,
  resetAppBootStore,
  subscribeAppBoot,
  getAppBootSnapshot,
  getAppBootServerSnapshot,
  setAppBootShell,
} from "@/lib/app-boot/app-boot-store";
import type { AppBootState } from "@/lib/app-boot/app-boot-types";
import type { ProfileRow } from "@/lib/profile/types";
import { markBootVerifyFirstPaint } from "@/lib/app-boot/client-boot-request-journal";
import {
  markBootMetricsFirstPaint,
  markBootMetricsReactMounted,
} from "@/lib/startup/startup-metrics";
import { ensureAppBoot, invalidateAppBootFlight } from "@/lib/app-boot/run-app-boot";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { clearAuthSessionClientCache } from "@/lib/auth/fetch-auth-session-client";
import {
  clearChunkReloadSessionFlag,
  isWebpackChunkLoadError,
  scheduleChunkReloadOncePerBuild,
} from "@/lib/next/import-with-chunk-retry";
import { logAppBuildFingerprintOnce } from "@/lib/build/app-build-fingerprint";
import { AbandonedR15LocalStatePurge } from "@/components/app/AbandonedR15LocalStatePurge";
import { startEntryTelemetry } from "@/lib/telemetry/entry-telemetry.client";
import { startWebVersionResumeCheck } from "@/lib/startup/web-version-resume.client";
import { installSessionFreshnessFetchGate } from "@/lib/auth/session-freshness-fetch-gate.client";

/**
 * Phase 3-2a (Auth HARD LOCK Amendment 2026-11-08 (7)): 모듈 로드 시점 = 루트 셸 렌더·자식 effect 의 첫 `/api` 요청보다 먼저.
 * 만료 임박 토큰일 때만 SDK 갱신 완료를 기다린다 (상한 3초). 서버 렌더에서는 무동작.
 */
installSessionFreshnessFetchGate();

const AppBootContext = createContext<AppBootState | null>(null);

export function invalidateAppBootAll(): void {
  invalidateAppBootFlight();
  invalidateAppBootProfileCache();
  invalidateMeProfileDedupedCache();
  clearAuthSessionClientCache();
  resetAppBootStore();
  cancelAppBootBackgroundHydration();
}

/**
 * Fresh login only — guest/anonymous boot → authenticated refresh.
 * DO NOT use logout wipe (`invalidateAppBootAll`): that resets to idle and
 * forces a full second cold-boot critical path on every login.
 */
export function invalidateAppBootForAuthUpgrade(): void {
  cancelAppBootBackgroundHydration();
  invalidateAppBootFlight();
  invalidateAppBootProfileCache();
  invalidateMeProfileDedupedCache();
  clearAuthSessionClientCache();
  markAppBootAuthUpgradePending();
}

export function AppBootProvider({ children }: { children: ReactNode }) {
  const boot = useSyncExternalStore(subscribeAppBoot, getAppBootSnapshot, getAppBootServerSnapshot);

  useEffect(() => {
    logAppBuildFingerprintOnce("AppBootProvider");
    // C8 관측 시작 (해제 없음 관측·복귀 기록) — 부팅 순서·네트워크에 영향 없음.
    startEntryTelemetry();
    // C3 — 30분 이상 백그라운드 후 복귀 시 새 웹 배포 확인, 허브 화면·통화/입력/모달 없음일 때만 1회 새로고침.
    startWebVersionResumeCheck();
    clearChunkReloadSessionFlag();
    setAppBootShell();
    markBootMetricsReactMounted();
    if (typeof window !== "undefined") {
      (
        window as Window & {
          __dibayAppBootProbe?: () => ReturnType<typeof getAppBootSnapshot> & { ready: boolean };
        }
      ).__dibayAppBootProbe = () => {
        const snap = getAppBootSnapshot();
        return { ...snap, ready: snap.status === "ready" || snap.status === "anonymous" };
      };
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (isWebpackChunkLoadError(reason)) {
        event.preventDefault();
        // R2-b: 빌드당 1회 — 마운트마다 지워지는 「1회」 표시로는 반복 새로고침을 막지 못했다 (통화 경계는 무변경).
        scheduleChunkReloadOncePerBuild();
        return;
      }
      if (reason instanceof TypeError && /NetworkError|Failed to fetch/i.test(reason.message)) {
        // dev HMR·서버 재시작 직후 in-flight fetch — 치명 오류 아님
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          markBootVerifyFirstPaint();
          markBootMetricsFirstPaint();
        });
      });
    }
    void ensureAppBoot();
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      cancelAppBootBackgroundHydration();
    };
  }, []);

  return (
    <AppBootContext.Provider value={boot}>
      <AbandonedR15LocalStatePurge />
      {children}
    </AppBootContext.Provider>
  );
}

export function useAppBoot(): AppBootState {
  const ctx = useContext(AppBootContext);
  return ctx ?? getAppBootSnapshot();
}

export function useAppBootProfile(): ProfileRow | null {
  return useAppBoot().profile;
}
