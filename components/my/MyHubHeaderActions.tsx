"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import { primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";

const HUB_IN_APP_SOUND_SETTINGS_FLIGHT = "me:notification-settings:hub-header";

/**
 * 전역 1단 헤더 우측: 인앱 알림음 on/off + 톱니(설정 허브).
 * 미읽음 개수 뱃지는 표시하지 않음 — 하단 「거래」·플로팅 채팅 메뉴만 뱃지 유지.
 */
export function MyHubHeaderActions() {
  return (
    <Suspense fallback={<MyHubHeaderActionsFallback />}>
      <MyHubHeaderActionsInner />
    </Suspense>
  );
}

function MyHubHeaderActionsInner() {
  const { t } = useI18n();
  const [soundOn, setSoundOn] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadSound = useCallback(async () => {
    try {
      const soundOnNext = await runSingleFlight(HUB_IN_APP_SOUND_SETTINGS_FLIGHT, async () => {
        const res = await fetch("/api/me/notification-settings", { credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: { sound_enabled?: boolean };
        };
        if (res.ok && j?.ok && j.settings) {
          return j.settings.sound_enabled !== false;
        }
        return null;
      });
      if (soundOnNext != null) setSoundOn(soundOnNext);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadSound();
  }, [loadSound]);

  useEffect(() => {
    const onCustom = () => {
      forgetSingleFlight(HUB_IN_APP_SOUND_SETTINGS_FLIGHT);
      void loadSound();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("kasama:user-notification-settings-changed", onCustom);
    return () => window.removeEventListener("kasama:user-notification-settings-changed", onCustom);
  }, [loadSound]);

  const onToggleSound = async () => {
    if (busy) return;
    setBusy(true);
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
          primeNotificationSoundAudio();
        }
        forgetSingleFlight(HUB_IN_APP_SOUND_SETTINGS_FLIGHT);
        window.dispatchEvent(new Event("kasama:user-notification-settings-changed"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-[88px] shrink-0 items-center justify-end gap-0.5">
      <button
        type="button"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-sam-primary-soft disabled:opacity-60 ${!soundOn && loaded ? "opacity-70" : ""}`}
        onClick={() => void onToggleSound()}
        aria-pressed={soundOn}
        disabled={busy}
        aria-label={soundOn ? t("hub_inapp_sound_on_aria") : t("hub_inapp_sound_off_aria")}
      >
        {soundOn ? <BellIcon /> : <BellMutedIcon />}
      </button>
      <Link
        href={buildMypageInfoHubHref()}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-sam-primary-soft"
        aria-label={t("hub_settings_aria")}
      >
        <SettingsIcon />
      </Link>
    </div>
  );
}

function MyHubHeaderActionsFallback() {
  const { t } = useI18n();
  return (
    <div className="flex w-[88px] shrink-0 items-center justify-end gap-0.5">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground opacity-70"
        aria-hidden
      >
        <BellIcon />
      </span>
      <Link
        href={buildMypageInfoHubHref()}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-sam-primary-soft"
        aria-label={t("hub_settings_aria")}
      >
        <SettingsIcon />
      </Link>
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

/** 인앱 알림음 꺼짐 — 종에 사선 */
function BellMutedIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
      <path d="M4 4l16 16" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
