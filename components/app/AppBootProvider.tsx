"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  cancelAppBootBackgroundHydration,
} from "@/lib/app-boot/schedule-app-boot-background";
import { invalidateAppBootProfileCache } from "@/lib/app-boot/fetch-app-boot-profile";
import { resetAppBootStore, subscribeAppBoot, getAppBootSnapshot, setAppBootShell } from "@/lib/app-boot/app-boot-store";
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
import { clearChunkReloadSessionFlag, isWebpackChunkLoadError, scheduleChunkReloadOnce } from "@/lib/next/import-with-chunk-retry";

const AppBootContext = createContext<AppBootState | null>(null);

export function invalidateAppBootAll(): void {
  invalidateAppBootFlight();
  invalidateAppBootProfileCache();
  invalidateMeProfileDedupedCache();
  clearAuthSessionClientCache();
  resetAppBootStore();
  cancelAppBootBackgroundHydration();
}

export function AppBootProvider({ children }: { children: ReactNode }) {
  const boot = useSyncExternalStore(subscribeAppBoot, getAppBootSnapshot, getAppBootSnapshot);

  useEffect(() => {
    clearChunkReloadSessionFlag();
    setAppBootShell();
    markBootMetricsReactMounted();

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (isWebpackChunkLoadError(reason)) {
        event.preventDefault();
        scheduleChunkReloadOnce();
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

  return <AppBootContext.Provider value={boot}>{children}</AppBootContext.Provider>;
}

export function useAppBoot(): AppBootState {
  const ctx = useContext(AppBootContext);
  return ctx ?? getAppBootSnapshot();
}

export function useAppBootProfile(): ProfileRow | null {
  return useAppBoot().profile;
}
