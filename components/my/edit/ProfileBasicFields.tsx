"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AutoGrowTextarea } from "@/components/write/shared/AutoGrowTextarea";
import {
  PROFILE_EDIT_FIELD_CONTROL_CLASS,
  PROFILE_EDIT_STATUS_TEXTAREA_CLASS,
} from "@/lib/ui/profile-edit-starbucks-styles";
import { ProfileDibayIdSection } from "@/components/my/edit/ProfileDibayIdSection";

const PROFILE_EDIT_NICKNAME_INPUT_ID = "profile-edit-nickname";
import { ProfileEditFieldRow } from "@/components/my/edit/ui/ProfileEditFormShell";

export interface ProfileBasicFieldsProps {
  displayName: string;
  bio: string;
  dibayId: string | null;
  dibayIdLocked: boolean;
  username: string | null;
  usernameComplete: boolean;
  usernameHighlighted?: boolean;
  onDisplayNameChange: (v: string) => void;
  onBioChange: (v: string) => void;
  onDibayIdConfirmed: (confirmedDibayId: string) => void | Promise<void>;
  errors?: { displayName?: string };
}

export function ProfileBasicFields({
  displayName,
  bio,
  dibayId,
  dibayIdLocked,
  username,
  usernameComplete,
  usernameHighlighted = false,
  onDisplayNameChange,
  onBioChange,
  onDibayIdConfirmed,
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
        {!usernameComplete ? (
          <p className="mb-2 text-[13px] font-semibold text-red-600" role="status">
            {t("profile_edit_username_missing")}
          </p>
        ) : null}
        <ProfileDibayIdSection
          dibayId={dibayId}
          dibayIdLocked={dibayIdLocked}
          username={username}
          highlighted={usernameHighlighted}
          onConfirmed={onDibayIdConfirmed}
        />
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
