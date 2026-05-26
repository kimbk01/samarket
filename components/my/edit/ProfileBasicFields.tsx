"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PH_MOBILE_PLUS63_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { formatPhMobileDisplayPlus63, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import {
  PROFILE_EDIT_INPUT_CLASS,
  PROFILE_EDIT_TEXTAREA_CLASS,
} from "@/lib/ui/profile-edit-starbucks-styles";
import { ProfileEditFieldRow } from "@/components/my/edit/ui/ProfileEditFormShell";

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
  /** true — 닉네임은 히어로 영역에만 표시 */
  hideDisplayName?: boolean;
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
  hideDisplayName = false,
}: ProfileBasicFieldsProps) {
  const { t } = useI18n();

  const countryOptions = [
    { value: "PH", label: t("settings_country_ph") },
    { value: "KR", label: t("settings_country_kr") },
    { value: "US", label: t("settings_country_us") },
  ];

  return (
    <div>
      {!hideDisplayName ? (
        <ProfileEditFieldRow label={t("profile_edit_nickname_label")} first>
          <input
            type="text"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder={t("profile_edit_nickname_placeholder")}
            className={PROFILE_EDIT_INPUT_CLASS}
            autoComplete="nickname"
          />
          {errors.displayName ? (
            <p className="mt-1 text-[12px] text-red-600">{errors.displayName}</p>
          ) : null}
        </ProfileEditFieldRow>
      ) : null}

      <ProfileEditFieldRow label={t("profile_edit_status_label")} first={hideDisplayName}>
        <textarea
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          placeholder={t("profile_edit_status_placeholder")}
          rows={2}
          className={PROFILE_EDIT_TEXTAREA_CLASS}
        />
      </ProfileEditFieldRow>

      <ProfileEditFieldRow label={t("profile_edit_contact_label")}>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={18}
          value={formatPhMobileDisplayPlus63(phone)}
          onChange={(e) => onPhoneChange(parsePhMobileInput(e.target.value))}
          placeholder={PH_MOBILE_PLUS63_PLACEHOLDER}
          className={PROFILE_EDIT_INPUT_CLASS}
        />
        {errors.phone ? <p className="mt-1 text-[12px] text-red-600">{errors.phone}</p> : null}
      </ProfileEditFieldRow>

      <ProfileEditFieldRow label={t("profile_edit_country_label")}>
        <select
          value={preferredCountry}
          onChange={(e) => onPreferredCountryChange(e.target.value)}
          className={PROFILE_EDIT_INPUT_CLASS}
        >
          {countryOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </ProfileEditFieldRow>
    </div>
  );
}
