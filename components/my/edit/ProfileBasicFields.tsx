"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AutoGrowTextarea } from "@/components/write/shared/AutoGrowTextarea";
import {
  PROFILE_EDIT_FIELD_CONTROL_CLASS,
  PROFILE_EDIT_READONLY_VALUE_CLASS,
  PROFILE_EDIT_STATUS_TEXTAREA_CLASS,
} from "@/lib/ui/profile-edit-starbucks-styles";

const PROFILE_EDIT_NICKNAME_INPUT_ID = "profile-edit-nickname";
import { ProfileEditFieldRow } from "@/components/my/edit/ui/ProfileEditFormShell";

export interface ProfileBasicFieldsProps {
  displayName: string;
  bio: string;
  atUsername: string;
  onDisplayNameChange: (v: string) => void;
  onBioChange: (v: string) => void;
  errors?: { displayName?: string };
}

export function ProfileBasicFields({
  displayName,
  bio,
  atUsername,
  onDisplayNameChange,
  onBioChange,
  errors = {},
}: ProfileBasicFieldsProps) {
  const { t } = useI18n();

  return (
    <div>
      <ProfileEditFieldRow
        label={t("profile_edit_nickname_label")}
        htmlFor={PROFILE_EDIT_NICKNAME_INPUT_ID}
        first
      >
        <input
          id={PROFILE_EDIT_NICKNAME_INPUT_ID}
          type="text"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder={t("profile_edit_nickname_placeholder")}
          className={PROFILE_EDIT_FIELD_CONTROL_CLASS}
          autoComplete="nickname"
          maxLength={20}
        />
        {errors.displayName ? (
          <p className="mt-1 text-[12px] text-red-600">{errors.displayName}</p>
        ) : null}
      </ProfileEditFieldRow>

      <ProfileEditFieldRow label={t("profile_edit_username_label")}>
        <p className={PROFILE_EDIT_READONLY_VALUE_CLASS}>{atUsername || "—"}</p>
      </ProfileEditFieldRow>

      <ProfileEditFieldRow label={t("profile_edit_status_label")}>
        <AutoGrowTextarea
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          placeholder={t("profile_edit_status_placeholder")}
          className={PROFILE_EDIT_STATUS_TEXTAREA_CLASS}
        />
      </ProfileEditFieldRow>
    </div>
  );
}
