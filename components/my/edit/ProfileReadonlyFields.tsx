"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProfileRow } from "@/lib/profile/types";
import { hasFormalMemberContactVerification } from "@/lib/auth/member-access";
import { formatPhMobileDisplayPlus63, parsePhMobileInput } from "@/lib/utils/ph-mobile";

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
      <span className="shrink-0 text-[13px] text-[#6F4E37]">{label}</span>
      <span className="min-w-0 truncate text-right text-[14px] font-medium text-[#1E3932]">{value}</span>
    </div>
  );
}

export function ProfileReadonlyFields({ profile }: { profile: ProfileRow }) {
  const { t } = useI18n();
  const contactFormal = hasFormalMemberContactVerification({
    phone_verified: profile.phone_verified,
    auth_provider: profile.auth_provider,
    email: profile.email,
  });

  const phoneStatus = contactFormal
    ? t("account_verified")
    : profile.phone_verification_status === "pending"
      ? t("account_pending")
      : t("account_unverified");

  const verifiedPhoneDisplay = formatPhMobileDisplayPlus63(parsePhMobileInput(profile.phone ?? ""));

  return (
    <div className="divide-y divide-[#D4E9E2]/80">
      <ReadonlyRow label={t("account_email")} value={profile.email ?? "—"} />
      <ReadonlyRow
        label={t("account_realname")}
        value={profile.realname_verified ? t("account_verified") : t("account_unverified")}
      />
      <ReadonlyRow label={t("account_phone_verification")} value={phoneStatus} />
      {contactFormal && verifiedPhoneDisplay ? (
        <ReadonlyRow label={t("profile_edit_contact_label")} value={verifiedPhoneDisplay} />
      ) : null}
      <ReadonlyRow label={t("profile_edit_member_tier")} value={profile.role} />
      <ReadonlyRow label={t("profile_edit_points")} value={String(profile.points)} />
    </div>
  );
}
