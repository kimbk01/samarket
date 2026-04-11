"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { primeNotificationSoundAudio } from "@/lib/notifications/play-notification-sound";
import { useCallback, useEffect, useState } from "react";

/**
 * LINE 홈 상단 우측에 가깝게 — 친구 메뉴·요청 배지·알림음·설정을 한 줄에 유지 (모바일 터치 영역 44px 근방).
 */
export function CommunityMessengerHeaderActions({
  incomingRequestCount,
  onOpenFriendMenu,
  onOpenRequestList,
  onOpenSettings,
}: {
  incomingRequestCount: number;
  onOpenFriendMenu: () => void;
  onOpenRequestList: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex max-w-[min(100vw-120px,200px)] shrink-0 items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={onOpenFriendMenu}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
        aria-label="친구 추가·그룹 만들기"
      >
        <PersonPlusIcon />
      </button>
      <button
        type="button"
        onClick={onOpenRequestList}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
        aria-label={`친구 요청${incomingRequestCount > 0 ? ` ${incomingRequestCount}건` : ""}`}
      >
        <InboxIcon />
        {incomingRequestCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#06C755] px-1 text-[10px] font-bold leading-none text-white">
            {incomingRequestCount > 99 ? "99+" : incomingRequestCount}
          </span>
        ) : null}
      </button>
      <MessengerSoundSettingsCluster onOpenSettings={onOpenSettings} />
    </div>
  );
}

/** 기존 `MyHubHeaderActions` 와 동일 동작 — 폭만 컴팩트하게 유지 */
function MessengerSoundSettingsCluster({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useI18n();
  const [soundOn, setSoundOn] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadSound = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notification-settings", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        settings?: { sound_enabled?: boolean };
      };
      if (res.ok && j?.ok && j.settings) {
        setSoundOn(j.settings.sound_enabled !== false);
      }
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
    const onCustom = () => void loadSound();
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
        window.dispatchEvent(new Event("kasama:user-notification-settings-changed"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight disabled:opacity-60 ${!soundOn && loaded ? "opacity-70" : ""}`}
        onClick={() => void onToggleSound()}
        aria-pressed={soundOn}
        disabled={busy}
        aria-label={soundOn ? t("hub_inapp_sound_on_aria") : t("hub_inapp_sound_off_aria")}
      >
        {soundOn ? <BellIcon /> : <BellMutedIcon />}
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
        aria-label="메신저 설정"
      >
        <SettingsIconSolid />
      </button>
    </>
  );
}

function PersonPlusIcon() {
  return (
    <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 11a4 4 0 100-8 4 4 0 000 8zM3 21v-1a6 6 0 0112 0v1" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg className="h-[21px] w-[21px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function BellMutedIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  );
}

/** 단색 채움 스타일 (톱니 설정) */
function SettingsIconSolid() {
  return (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}
