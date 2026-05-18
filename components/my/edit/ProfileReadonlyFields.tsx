"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProfileRow } from "@/lib/profile/types";
import { hasFormalMemberContactVerification } from "@/lib/auth/member-access";

export interface ProfileReadonlyFieldsProps {
  profile: ProfileRow;
}

export function ProfileReadonlyFields({ profile }: ProfileReadonlyFieldsProps) {
  const { t } = useI18n();
  const contactFormal = hasFormalMemberContactVerification({
    phone_verified: profile.phone_verified,
    auth_provider: profile.auth_provider,
    email: profile.email,
  });

  return (
    <div className="space-y-3 rounded-ui-rect bg-sam-app p-3">
      <p className="sam-text-helper font-medium text-sam-muted">{t("profile_edit_readonly_badge")}</p>
      <div className="grid gap-2 sam-text-body">
        <div className="flex justify-between">
          <span className="text-sam-muted">{t("my_account_username")}</span>
          <span className="font-mono text-sam-fg tabular-nums">{profile.username ? `@${profile.username}` : "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">{t("account_email")}</span>
          <span className="text-sam-fg">{profile.email ?? "-"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">{t("account_realname")}</span>
          <span className="text-sam-fg">
            {profile.realname_verified ? t("account_verified") : t("account_unverified")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">{t("account_phone_verification")}</span>
          <span className="text-sam-fg">
            {contactFormal
              ? t("account_verified")
              : profile.phone_verification_status === "pending"
                ? t("account_pending")
                : t("account_unverified")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">{t("profile_edit_member_tier")}</span>
          <span className="text-sam-fg">{profile.role}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sam-muted">{t("profile_edit_points")}</span>
          <span className="text-sam-fg">{profile.points}</span>
        </div>
      </div>
    </div>
  );
}
