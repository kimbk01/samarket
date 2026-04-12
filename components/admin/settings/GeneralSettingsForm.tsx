"use client";

import { useRef } from "react";
import type { AppSettings } from "@/lib/types/admin-settings";
import {
  DEFAULT_LOCALE_OPTIONS,
  DEFAULT_CURRENCY_OPTIONS,
} from "@/lib/admin-settings/admin-settings-utils";

interface GeneralSettingsFormProps {
  values: Pick<AppSettings, "siteName" | "defaultCurrency" | "defaultLocale" | "alarmSoundDataUrl">;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function GeneralSettingsForm({ values, onChange }: GeneralSettingsFormProps) {
  const alarmInputRef = useRef<HTMLInputElement>(null);

  const handleAlarmFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      alert("MP3 등 오디오 파일만 선택해 주세요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      onChange("alarmSoundDataUrl", dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const currencyValue =
    DEFAULT_CURRENCY_OPTIONS.some((o) => o.value === values.defaultCurrency)
      ? values.defaultCurrency
      : DEFAULT_CURRENCY_OPTIONS[0].value;
  const localeValue =
    DEFAULT_LOCALE_OPTIONS.some((o) => o.value === values.defaultLocale)
      ? values.defaultLocale
      : DEFAULT_LOCALE_OPTIONS[0].value;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-sam-muted">
        사이트 기본 정보 · 사이트명은 웹 탭 제목과 앱 내 노출에 사용됩니다.
      </p>
      <div>
        <label className="block text-[13px] font-medium text-sam-fg">
          사이트명
        </label>
        <input
          type="text"
          value={values.siteName}
          onChange={(e) => onChange("siteName", e.target.value)}
          placeholder="KASAMA"
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 text-[14px] text-sam-fg"
        />
        {values.siteName && (
          <p className="mt-1 text-[12px] text-sam-muted">
            현재: <strong>{values.siteName}</strong> (저장 후 웹 탭 제목에 반영)
          </p>
        )}
      </div>
      <div>
        <label className="block text-[13px] font-medium text-sam-fg">
          기본 통화
        </label>
        <select
          value={currencyValue}
          onChange={(e) => onChange("defaultCurrency", e.target.value)}
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 text-[14px] text-sam-fg"
        >
          {DEFAULT_CURRENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[13px] font-medium text-sam-fg">
          기본 로케일
        </label>
        <select
          value={localeValue}
          onChange={(e) => onChange("defaultLocale", e.target.value)}
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 text-[14px] text-sam-fg"
        >
          {DEFAULT_LOCALE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[13px] font-medium text-sam-fg">
          알람 등록
        </label>
        <p className="mt-0.5 text-[12px] text-sam-muted">
          알람(벨) 버튼 클릭 시 재생할 MP3를 선택하세요. 내 PC에서 파일을 저장하면 알람 사운드로 설정됩니다.
        </p>
        <input
          ref={alarmInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/*"
          onChange={handleAlarmFile}
          className="mt-2 block w-full max-w-xs text-[13px] text-sam-muted file:mr-2 file:rounded file:border-0 file:bg-signature file:px-3 file:py-1.5 file:text-[13px] file:text-white file:hover:opacity-90"
        />
        {values.alarmSoundDataUrl ? (
          <p className="mt-2 text-[12px] text-green-600">알람 사운드가 설정되어 있습니다.</p>
        ) : (
          <p className="mt-2 text-[12px] text-sam-muted">알람 사운드가 없습니다. MP3 파일을 선택해 주세요.</p>
        )}
      </div>
    </div>
  );
}
