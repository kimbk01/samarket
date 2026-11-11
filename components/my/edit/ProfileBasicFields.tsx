"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AutoGrowTextarea } from "@/components/write/shared/AutoGrowTextarea";
import {
  PROFILE_EDIT_FIELD_CONTROL_CLASS,
  PROFILE_EDIT_FIELD_INCOMPLETE_CLASS,
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
  dibayIdAutoAssigned?: boolean;
  dibayIdChangedOnce?: boolean;
  /** DB 생성 컬럼 — 상태·변경권 단일 판정 */
  dibayIdState?: string | null;
  dibayIdCanChange?: boolean | null;
  username: string | null;
  usernameConfirmed?: boolean | null;
  usernameComplete: boolean;
  usernameHighlighted?: boolean;
  nicknameComplete?: boolean;
  dibayIdComplete?: boolean;
  onDisplayNameChange: (v: string) => void;
  onBioChange: (v: string) => void;
  onDibayIdConfirmed: (confirmedDibayId: string) => void | Promise<void>;
  errors?: { displayName?: string };
}

function fieldControlClass(complete: boolean): string {
  return complete
    ? PROFILE_EDIT_FIELD_CONTROL_CLASS
    : `${PROFILE_EDIT_FIELD_CONTROL_CLASS} ${PROFILE_EDIT_FIELD_INCOMPLETE_CLASS}`;
}

export function ProfileBasicFields({
  displayName,
  bio,
  dibayId,
  dibayIdLocked,
  dibayIdAutoAssigned = false,
  dibayIdChangedOnce = false,
  dibayIdState = null,
  dibayIdCanChange = null,
  username,
  usernameConfirmed = null,
  usernameComplete,
  usernameHighlighted = false,
  nicknameComplete = true,
  dibayIdComplete = true,
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
          className={fieldControlClass(nicknameComplete)}
          autoComplete="nickname"
          maxLength={20}
        />
        {errors.displayName ? (
          <p className="mt-1 text-[12px] text-sam-danger">{errors.displayName}</p>
        ) : null}
      </ProfileEditFieldRow>

      <ProfileEditFieldRow label={t("profile_edit_username_label")}>
        <div data-profile-field="dibay_id">
          <ProfileDibayIdSection
            dibay_id={dibayId}
            dibay_id_locked={dibayIdLocked}
            dibay_id_auto_assigned={dibayIdAutoAssigned}
            dibay_id_changed_once={dibayIdChangedOnce}
            dibay_id_state={dibayIdState}
            dibay_id_can_change={dibayIdCanChange}
            username={username}
            username_confirmed={usernameConfirmed}
            highlighted={usernameHighlighted}
            fieldComplete={dibayIdComplete}
            onConfirmed={onDibayIdConfirmed}
          />
        </div>
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
