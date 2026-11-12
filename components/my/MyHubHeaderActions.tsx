"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyHeaderNotificationInbox } from "@/components/my/MyHeaderNotificationInbox";
import {
  fetchMeNotificationSettingsSnapshot,
  invalidateMeNotificationSettingsGetFlight,
} from "@/lib/me/fetch-me-notification-settings-client";
import { scheduleNotificationSettingsSnapshotDeferred } from "@/lib/http/startup-api-scheduler";
import { unlockNotificationSoundAudio } from "@/lib/notifications/notification-sound-unlock";

import {
  samTier1HeaderIconCluster,
  SAM_TIER1_HEADER_ACTION_BTN_CLASS,
} from "@/lib/ui/tier1-header-icon";

const HUB_TRAILING_ROW_CLASS = samTier1HeaderIconCluster;

/**
 * 1단 헤더: 인앱 알림음 on/off(종) — `RegionBar`에서 필라이프 우측에 단독 배치 가능.
 */
export function MyHubHeaderInAppSound() {
  return (
    <div className="flex shrink-0 items-center justify-end">
      <Suspense fallback={<MyHubHeaderInAppSoundFallback />}>
        <MyHubHeaderInAppSoundInner />
      </Suspense>
    </div>
  );
}

function MyHubHeaderInAppSoundFallback() {
  return (
    <span className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} opacity-70`} aria-hidden>
      <BellIcon />
    </span>
  );
}

function MyHubHeaderInAppSoundInner() {
  const { t } = useI18n();
  const [soundOn, setSoundOn] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadSound = useCallback(async () => {
    try {
      const snapshot = await fetchMeNotificationSettingsSnapshot();
      if (snapshot?.ok && snapshot.settings) {
        const nextSoundOn = snapshot.settings.sound_enabled !== false;
        setSoundOn((prev) => (prev === nextSoundOn ? prev : nextSoundOn));
      }
    } catch {
      /* ignore */
    } finally {
      setLoaded((prev) => (prev ? prev : true));
    }
  }, []);

  useEffect(() => {
    const cancel = scheduleNotificationSettingsSnapshotDeferred(
      () => {
        void loadSound();
      },
      { source: "notification-settings-my-hub" }
    );
    return cancel;
  }, [loadSound]);

  useEffect(() => {
    const onCustom = () => {
      invalidateMeNotificationSettingsGetFlight();
      void loadSound();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("kasama:user-notification-settings-changed", onCustom);
    return () => window.removeEventListener("kasama:user-notification-settings-changed", onCustom);
  }, [loadSound]);

  const onToggleSound = async () => {
    if (busy) return;
    setBusy((prev) => (prev ? prev : true));
    const next = !soundOn;
    try {
      const res = await fetch("/api/me/notification-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sound_enabled: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && j?.ok) {
        setSoundOn(next);
        if (next && typeof window !== "undefined") {
          unlockNotificationSoundAudio();
        }
        invalidateMeNotificationSettingsGetFlight();
        window.dispatchEvent(new Event("kasama:user-notification-settings-changed"));
      }
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  };

  return (
    <button
      type="button"
      className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} relative disabled:opacity-60 ${!soundOn && loaded ? "opacity-70" : ""}`}
      onClick={() => void onToggleSound()}
      aria-pressed={soundOn}
      disabled={busy}
      aria-label={soundOn ? t("hub_inapp_sound_on_aria") : t("hub_inapp_sound_off_aria")}
    >
      {soundOn ? <BellIcon /> : <BellMutedIcon />}
    </button>
  );
}

/** 전역 1단 헤더 우측 — 알림함만 (구 햄버거·앱 설정 패널 제거, `/mypage` 단일 허브). */
export function MyHubHeaderActions() {
  return (
    <Suspense fallback={<MyHubHeaderActionsFallback />}>
      <div className={HUB_TRAILING_ROW_CLASS}>
        <MyHeaderNotificationInbox />
      </div>
    </Suspense>
  );
}

function MyHubHeaderActionsFallback() {
  return (
    <div className={HUB_TRAILING_ROW_CLASS}>
      <span className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} opacity-70`} aria-hidden>
        <BellIcon />
      </span>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
    </svg>
  );
}

function BellMutedIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
      <path d="M4 4l16 16" strokeLinecap="round" />
    </svg>
  );
}
