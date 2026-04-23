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
  const inputClass = "sam-input mt-1";
  const textareaClass = "sam-textarea mt-1 min-h-[96px]";
  const selectClass = "sam-select mt-1";

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[13px] font-semibold text-sam-fg">닉네임 *</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value)}
          placeholder="닉네임"
          className={inputClass}
        />
        {errors.nickname && (
          <p className="mt-0.5 sam-text-xxs text-red-600">{errors.nickname}</p>
        )}
      </div>
      <div>
        <label className="text-[13px] font-semibold text-sam-fg">나의 상태</label>
        <textarea
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          placeholder="한 줄로 상태를 입력해 보세요"
          rows={2}
          className={textareaClass}
        />
      </div>
      <div>
        <label className="text-[13px] font-semibold text-sam-fg">연락처</label>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={17}
          value={formatPhMobileDisplay(phone)}
          onChange={(e) => onPhoneChange(parsePhMobileInput(e.target.value))}
          placeholder={PH_MOBILE_PLACEHOLDER}
          className={inputClass}
        />
        {errors.phone ? <p className="mt-0.5 sam-text-xxs text-red-600">{errors.phone}</p> : null}
      </div>
      <div>
        <label className="text-[13px] font-semibold text-sam-fg">선호 언어</label>
        <select
          value={preferredLanguage}
          onChange={(e) => onPreferredLanguageChange(e.target.value)}
          className={selectClass}
        >
          {LANG_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[13px] font-semibold text-sam-fg">선호 국가</label>
        <select
          value={preferredCountry}
          onChange={(e) => onPreferredCountryChange(e.target.value)}
          className={selectClass}
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
