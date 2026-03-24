"use client";

import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";

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
  errors?: { nickname?: string };
}

const LANG_OPTIONS = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
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
  return (
    <div className="space-y-4">
      <div>
        <label className="text-[14px] font-medium text-gray-700">닉네임 *</label>
        <input
          type="text"
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value)}
          placeholder="닉네임"
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
        {errors.nickname && (
          <p className="mt-1 text-[12px] text-red-600">{errors.nickname}</p>
        )}
      </div>
      <div>
        <label className="text-[14px] font-medium text-gray-700">소개</label>
        <textarea
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          placeholder="소개글"
          rows={3}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="text-[14px] font-medium text-gray-700">연락처</label>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder={PH_MOBILE_PLACEHOLDER}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="text-[14px] font-medium text-gray-700">선호 언어</label>
        <select
          value={preferredLanguage}
          onChange={(e) => onPreferredLanguageChange(e.target.value)}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          {LANG_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[14px] font-medium text-gray-700">선호 국가</label>
        <select
          value={preferredCountry}
          onChange={(e) => onPreferredCountryChange(e.target.value)}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
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
