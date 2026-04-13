"use client";

import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";

export interface ProfileBasicFieldsProps {
  nickname: string;
  bio: string;
  phone: string;
  preferredLanguage: string;
  preferredCountry: string;
  onNicknameChange: (v: string) => void;
  onBioChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onPreferredLanguageChange: (v: string) => void;
  onPreferredCountryChange: (v: string) => void;
  errors?: { nickname?: string; phone?: string };
}

const LANG_OPTIONS = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
];

const COUNTRY_OPTIONS = [
  { value: "PH", label: "필리핀" },
  { value: "KR", label: "한국" },
  { value: "US", label: "미국" },
];

export function ProfileBasicFields({
  nickname,
  bio,
  phone,
  preferredLanguage,
  preferredCountry,
  onNicknameChange,
  onBioChange,
  onPhoneChange,
  onPreferredLanguageChange,
  onPreferredCountryChange,
  errors = {},
}: ProfileBasicFieldsProps) {
  const controlClass =
    "mt-1 w-full rounded border border-sam-border px-2.5 py-1.5 text-[13px] leading-snug";

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[13px] font-medium text-sam-fg">닉네임 *</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value)}
          placeholder="닉네임"
          className={controlClass}
        />
        {errors.nickname && (
          <p className="mt-0.5 text-[11px] text-red-600">{errors.nickname}</p>
        )}
      </div>
      <div>
        <label className="text-[13px] font-medium text-sam-fg">나의 상태</label>
        <textarea
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          placeholder="한 줄로 상태를 입력해 보세요"
          rows={2}
          className={`${controlClass} min-h-0 resize-y`}
        />
      </div>
      <div>
        <label className="text-[13px] font-medium text-sam-fg">연락처</label>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={17}
          value={formatPhMobileDisplay(phone)}
          onChange={(e) => onPhoneChange(parsePhMobileInput(e.target.value))}
          placeholder={PH_MOBILE_PLACEHOLDER}
          className={controlClass}
        />
        {errors.phone ? <p className="mt-0.5 text-[11px] text-red-600">{errors.phone}</p> : null}
      </div>
      <div>
        <label className="text-[13px] font-medium text-sam-fg">선호 언어</label>
        <select
          value={preferredLanguage}
          onChange={(e) => onPreferredLanguageChange(e.target.value)}
          className={controlClass}
        >
          {LANG_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[13px] font-medium text-sam-fg">선호 국가</label>
        <select
          value={preferredCountry}
          onChange={(e) => onPreferredCountryChange(e.target.value)}
          className={controlClass}
        >
          {COUNTRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
