"use client";

import { useEffect } from "react";
import { getAndroidInstalledVersion, getCapacitorAppInstalledVersion } from "@/lib/platform/android-play-in-app-update";
import { subscribeAndroidFlexibleUpdateAvailable } from "@/lib/platform/android-play-in-app-update-orchestrator";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";

const INSTALLED_KEY = "dibay:app-release:reported-installed";
const AVAILABLE_KEY_PREFIX = "dibay:app-release:reported-available:";

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 저장 불가 — 다음 실행에 다시 보고될 뿐 */
  }
}

async function readInstalledLabel(platform: "android" | "ios"): Promise<string> {
  const native = platform === "android" ? await getAndroidInstalledVersion() : null;
  const cap = native ? null : await getCapacitorAppInstalledVersion();
  const name = native?.versionName || cap?.versionName || "";
  const code = native?.versionCode ?? cap?.versionCode ?? null;
  return name ? (code != null ? `${name} (${code})` : name) : "";
}

async function report(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch("/api/me/app-releases", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 앱 업데이트 v3 (Owner 2026-11-01 「서버 부하 최소 · 안 된 기기만 · 최소 알림」) — 서버 주기 확인 없음.
 * - 설치 버전이 바뀐 실행에서만 1번 보고 → 업데이트 내역 기록 + 이미 받은 업데이트 안내 자동 읽음
 * - 앱을 열 때 Play 가 새 버전을 알려 주면(업데이트 팝업과 같은 순간) 그 빌드당 1번만 보고 → 이 회원에게만 종 알림 1건
 */
export function AppReleaseReporter() {
  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;
    const platform = resolveCapacitorShellPlatform() === "ios" ? "ios" : "android";
    let installedLabel = "";
    let cancelled = false;

    void (async () => {
      installedLabel = await readInstalledLabel(platform);
      if (cancelled || !installedLabel || !getSyncViewerUserIdForClient()) return;
      const marker = `${platform}:${installedLabel}:${getSyncViewerUserIdForClient()}`;
      if (readLocal(INSTALLED_KEY) === marker) return;
      if (await report({ platform, installed: installedLabel })) writeLocal(INSTALLED_KEY, marker);
    })();

    const unsubscribe =
      platform === "android"
        ? subscribeAndroidFlexibleUpdateAvailable((payload) => {
            const code = payload.availableVersionCode;
            const viewer = getSyncViewerUserIdForClient();
            if (typeof code !== "number" || !viewer) return;
            const key = `${AVAILABLE_KEY_PREFIX}${code}:${viewer}`;
            if (readLocal(key)) return;
            const installed =
              installedLabel ||
              (payload.installedVersionName
                ? `${payload.installedVersionName}${payload.installedVersionCode != null ? ` (${payload.installedVersionCode})` : ""}`
                : "");
            void report({ platform, installed, available_version_code: code }).then((ok) => {
              if (ok) writeLocal(key, "1");
            });
          })
        : () => undefined;

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return null;
}
