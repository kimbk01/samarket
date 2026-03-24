"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getMypageSettings, setMypageSettings } from "@/lib/mypage-settings/store";
import { getCurrentUser } from "@/lib/auth/get-current-user";

interface SettingsSectionContentProps {
  section: string;
  description?: string;
}

export function SettingsSectionContent({ section, description }: SettingsSectionContentProps) {
  const [settings, setSettings] = useState(getMypageSettings);

  const refresh = useCallback(() => setSettings(getMypageSettings()), []);

  useEffect(() => {
    refresh();
  }, [section, refresh]);

  if (section === "account") {
    const user = getCurrentUser();
    return (
      <div className="mt-4 space-y-4">
        <div>
          <p className="text-[12px] text-gray-500">이메일</p>
          <p className="text-[14px] text-gray-800">{user?.email ?? "—"}</p>
        </div>
        <div>
          <p className="text-[12px] text-gray-500">연락처</p>
          <p className="text-[14px] text-gray-800">연락처를 등록해 주세요.</p>
        </div>
        <p className="text-[13px] text-gray-500">본인 인증은 추후 연동됩니다.</p>
      </div>
    );
  }

  if (section === "notifications") {
    const items = [
      { key: "chatNotification" as const, label: "채팅 알림" },
      { key: "keywordNotification" as const, label: "키워드 알림" },
      { key: "communityNotification" as const, label: "동네생활 알림" },
      { key: "adNotification" as const, label: "광고·이벤트" },
    ];
    return (
      <div className="mt-4 space-y-3">
        {items.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between py-2">
            <span className="text-[14px] text-gray-800">{label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings[key]}
              onClick={() => {
                setMypageSettings({ [key]: !settings[key] });
                refresh();
              }}
              className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                settings[key] ? "bg-signature" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  settings[key] ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (section === "quiet-hours") {
    return (
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between py-2">
          <span className="text-[14px] text-gray-800">방해금지 시간 사용</span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.quietHoursEnabled}
            onClick={() => {
              setMypageSettings({ quietHoursEnabled: !settings.quietHoursEnabled });
              refresh();
            }}
            className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              settings.quietHoursEnabled ? "bg-signature" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.quietHoursEnabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={settings.quietHoursStart}
            onChange={(e) => {
              setMypageSettings({ quietHoursStart: e.target.value });
              refresh();
            }}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          />
          <span className="text-gray-500">~</span>
          <input
            type="time"
            value={settings.quietHoursEnd}
            onChange={(e) => {
              setMypageSettings({ quietHoursEnd: e.target.value });
              refresh();
            }}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          />
        </div>
        <p className="text-[13px] text-gray-500">설정한 시간에는 알림이 오지 않습니다.</p>
      </div>
    );
  }

  if (section === "language") {
    const options = ["한국어", "English", "日本語"];
    return (
      <ul className="mt-4 space-y-0">
        {options.map((lang) => (
          <li key={lang}>
            <button
              type="button"
              onClick={() => {
                setMypageSettings({ language: lang });
                refresh();
              }}
              className="flex w-full items-center justify-between py-3 text-left text-[14px] text-gray-800"
            >
              <span>{lang}</span>
              {settings.language === lang && (
                <span className="text-signature text-[12px] font-medium">선택됨</span>
              )}
            </button>
            <hr className="border-gray-100" />
          </li>
        ))}
      </ul>
    );
  }

  if (section === "autoplay") {
    return (
      <div className="mt-4">
        <div className="flex items-center justify-between py-2">
          <span className="text-[14px] text-gray-800">동영상 자동 재생</span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoplay}
            onClick={() => {
              setMypageSettings({ autoplay: !settings.autoplay });
              refresh();
            }}
            className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              settings.autoplay ? "bg-signature" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.autoplay ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    );
  }

  if (section === "version") {
    return (
      <div className="mt-4">
        <p className="text-[14px] text-gray-800">현재 버전 {settings.version}</p>
        <p className="mt-2 text-[13px] text-gray-500">최신 버전입니다.</p>
      </div>
    );
  }

  if (section === "cache") {
    return <CacheClearBlock />;
  }

  if (section === "leave") {
    return <LeaveBlock />;
  }

  return <p className="mt-4 text-[13px] text-gray-500">준비 중인 기능입니다.</p>;
}

function CacheClearBlock() {
  const [done, setDone] = useState(false);
  return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              setDone(true);
            }
          }}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[14px] font-medium text-gray-700 hover:bg-gray-50"
        >
          캐시 삭제
        </button>
        {done && <p className="mt-2 text-[13px] text-gray-500">삭제되었습니다.</p>}
      </div>
    );
}

function LeaveBlock() {
  return (
      <div className="mt-4">
        <p className="text-[13px] text-gray-600">
          탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            href="/mypage/settings"
            className="rounded-lg border border-gray-300 px-4 py-2 text-[14px] font-medium text-gray-700"
          >
            취소
          </Link>
          <Link
            href="/mypage/settings"
            className="rounded-lg bg-red-500 px-4 py-2 text-[14px] font-medium text-white"
          >
            탈퇴하기
          </Link>
        </div>
      </div>
  );
}
