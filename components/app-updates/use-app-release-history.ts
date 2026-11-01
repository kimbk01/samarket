"use client";

import { useEffect, useState } from "react";
import { getAndroidInstalledVersion, getCapacitorAppInstalledVersion } from "@/lib/platform/android-play-in-app-update";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";

export type AppReleaseItem = {
  version: string;
  versionCode: number | null;
  releasedAt: string;
  notesKo: string | null;
  notesEn: string | null;
  storeUrl: string | null;
  isNew: boolean;
  isCurrent: boolean;
};

export type AppReleaseHistoryState = {
  status: "loading" | "ready" | "error" | "web";
  platform: "android" | "ios" | null;
  installedLabel: string;
  releases: AppReleaseItem[];
  hasUpdate: boolean;
  latestStoreUrl: string | null;
};

/** 설치 버전을 읽고 업데이트 내역을 받는다 (앱 업데이트 v2). 최신이면 서버가 업데이트 안내 알림을 읽음 처리한다. */
export function useAppReleaseHistory(): AppReleaseHistoryState & { reload: () => void } {
  const [state, setState] = useState<AppReleaseHistoryState>({
    status: "loading",
    platform: null,
    installedLabel: "",
    releases: [],
    hasUpdate: false,
    latestStoreUrl: null,
  });
  const [key, setKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isCapacitorNativePlatform()) {
        if (!cancelled) setState((s) => ({ ...s, status: "web" }));
        return;
      }
      const platform = resolveCapacitorShellPlatform() === "ios" ? "ios" : "android";
      const native = platform === "android" ? await getAndroidInstalledVersion() : null;
      const cap = native ? null : await getCapacitorAppInstalledVersion();
      const name = native?.versionName || cap?.versionName || "";
      const code = native?.versionCode ?? cap?.versionCode ?? null;
      const installedLabel = name ? (code != null ? `${name} (${code})` : name) : "";
      try {
        const sp = new URLSearchParams({ platform, installed: installedLabel });
        const res = await fetch(`/api/me/app-releases?${sp.toString()}`, { credentials: "include", cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          releases?: AppReleaseItem[];
          hasUpdate?: boolean;
          latestStoreUrl?: string | null;
          notificationsRead?: number;
        };
        if (cancelled) return;
        if (!res.ok || !j.ok) {
          setState((s) => ({ ...s, status: "error", platform, installedLabel }));
          return;
        }
        setState({
          status: "ready",
          platform,
          installedLabel,
          releases: j.releases ?? [],
          hasUpdate: j.hasUpdate === true,
          latestStoreUrl: j.latestStoreUrl ?? null,
        });
        if ((j.notificationsRead ?? 0) > 0) {
          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
          resyncBadgesAfterNotificationEventsRead("notification_opened");
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, status: "error", platform, installedLabel }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { ...state, reload: () => setKey((k) => k + 1) };
}
