"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyHeaderNotificationInbox } from "@/components/my/MyHeaderNotificationInbox";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";
import { useMypageInfoHubPanel } from "@/contexts/MypageInfoHubPanelContext";
import {
  fetchMeNotificationSettingsSnapshot,
  invalidateMeNotificationSettingsGetFlight,
} from "@/lib/me/fetch-me-notification-settings-client";
import { primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";

const HUB_TRAILING_ROW_CLASS = "flex w-[88px] shrink-0 items-center justify-end gap-0.5";

function HamburgerMenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 햄버거(줄 3) — `Suspense` 전 폴백: 설정 전체 화면으로 이동 */
function HubHeaderSettingsHamburgerFallback() {
  const { t } = useI18n();
  return (
    <Link
      href={buildMypageInfoHubHref()}
      className="sam-header-action h-10 w-10 text-sam-fg"
      aria-label={t("hub_settings_aria")}
    >
      <HamburgerMenuIcon />
    </Link>
  );
}

/**
 * 1단 헤더: **햄버거** — 좌→우 풀 설정 패널(페이스북형) 열기.
 * `RegionBar` 필라이프 좌측 등 — `MypageInfoHubPanelProvider` 전제.
 */
export function MyHubHeaderInfoHubTrigger() {
  const { t } = useI18n();
  const { openInfoHub } = useMypageInfoHubPanel();
  return (
    <button
      type="button"
      onClick={openInfoHub}
      className="sam-header-action h-10 w-10 text-sam-fg"
      aria-label={t("hub_settings_aria")}
    >
      <HamburgerMenuIcon />
    </button>
  );
}

/**
 * 1단 헤더: 인앱 알림음 on/off(종) — `RegionBar`에서 필라이프 우측에 단독 배치 가능.
 */
export function MyHubHeaderInAppSound() {
  return (
    <div className="flex w-10 shrink-0 items-center justify-end">
      <Suspense fallback={<MyHubHeaderInAppSoundFallback />}>
        <MyHubHeaderInAppSoundInner />
      </Suspense>
    </div>
  );
}

function MyHubHeaderInAppSoundFallback() {
  return (
    <span className="sam-header-action h-10 w-10 text-sam-fg opacity-70" aria-hidden>
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
    void loadSound();
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
          primeNotificationSoundAudio();
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
      className={`sam-header-action relative h-10 w-10 text-sam-fg disabled:opacity-60 ${!soundOn && loaded ? "opacity-70" : ""}`}
      onClick={() => void onToggleSound()}
      aria-pressed={soundOn}
      disabled={busy}
      aria-label={soundOn ? t("hub_inapp_sound_on_aria") : t("hub_inapp_sound_off_aria")}
    >
      {soundOn ? <BellIcon /> : <BellMutedIcon />}
    </button>
  );
}

/**
 * 전역 1단 헤더 우측: 인앱 알림음(종) + 햄버거(앱·서비스 설정 패널).
 * 미읽음 개수 뱃지는 표시하지 않음 — 하단 「거래」·플로팅 채팅 메뉴만 뱃지 유지.
 */
export function MyHubHeaderActions() {
  return (
    <Suspense fallback={<MyHubHeaderActionsFallback />}>
      <div className={HUB_TRAILING_ROW_CLASS}>
        <MyHeaderNotificationInbox />
        <MyHubHeaderInfoHubTrigger />
      </div>
    </Suspense>
  );
}

function MyHubHeaderActionsFallback() {
  return (
    <div className={HUB_TRAILING_ROW_CLASS}>
      <span className="sam-header-action h-10 w-10 text-sam-fg opacity-70" aria-hidden>
        <BellIcon />
      </span>
      <HubHeaderSettingsHamburgerFallback />
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
