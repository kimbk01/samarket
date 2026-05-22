"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { formatPhMobileDisplay, parsePhMobileInput } from "@/lib/utils/ph-mobile";

export interface ProfileBasicFieldsProps {
  displayName: string;
  bio: string;
  phone: string;
  preferredCountry: string;
  onDisplayNameChange: (v: string) => void;
  onBioChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onPreferredCountryChange: (v: string) => void;
  errors?: { displayName?: string; phone?: string };
}

export function ProfileBasicFields({
  displayName,
  bio,
  phone,
  preferredCountry,
  onDisplayNameChange,
  onBioChange,
  onPhoneChange,
  onPreferredCountryChange,
  errors = {},
}: ProfileBasicFieldsProps) {
  const { t } = useI18n();
  const inputClass = "sam-input mt-1";
  const textareaClass = "sam-textarea mt-1 min-h-[96px]";
  const selectClass = "sam-select mt-1";

  const countryOptions = [
    { value: "PH", label: t("settings_country_ph") },
    { value: "KR", label: t("settings_country_kr") },
    { value: "US", label: t("settings_country_us") },
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[13px] font-semibold text-sam-fg">{t("profile_edit_nickname_label")}</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder={t("profile_edit_nickname_placeholder")}
          className={inputClass}
        />
        {errors.displayName ? <p className="mt-0.5 sam-text-xxs text-red-600">{errors.displayName}</p> : null}
      </div>
      <div>
        <label className="text-[13px] font-semibold text-sam-fg">{t("profile_edit_status_label")}</label>
        <textarea
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          placeholder={t("profile_edit_status_placeholder")}
          rows={2}
          className={textareaClass}
        />
      </div>
      <div>
        <label className="text-[13px] font-semibold text-sam-fg">{t("profile_edit_contact_label")}</label>
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
        <label className="text-[13px] font-semibold text-sam-fg">{t("profile_edit_country_label")}</label>
        <select
          value={preferredCountry}
          onChange={(e) => onPreferredCountryChange(e.target.value)}
          className={selectClass}
        >
          {countryOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
