"use client";

import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { isProfileContactVerified } from "@/lib/profile/profile-contact-verification-ui";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import { deriveStoreMemberStatus, hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";
import { ProfileVerificationCenter } from "@/components/profile/ProfileVerificationCenter";

export function MyAccountContent() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading((prev) => (prev ? prev : true));
    const p = await getMyProfile();
    setProfile(p);
    setLoading((prev) => (prev ? false : prev));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="py-4 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }
  if (!profile) {
    return (
      <div className="space-y-4">
        <div className="rounded-[20px] border border-[#d9e5df] bg-white p-5 text-center shadow-sm">
          <div className="mx-auto flex justify-center">
            <SamarketUserAvatar avatarUrl={null} sizePx={72} alt="" />
          </div>
          <p className="mt-3 sam-text-section-title font-semibold text-[#1e3932]">{t("profile_guest_name")}</p>
          <p className="mt-1 sam-text-body text-[#1e3932]/70">{t("profile_guest_desc")}</p>
          <button
            type="button"
            onClick={() => {
              void requireAuthAction("profile_edit", load, {
                next: "/mypage/account",
              });
            }}
            className="mt-4 w-full rounded-full bg-[#006241] px-4 py-3 sam-text-body font-semibold text-white active:bg-[#1e3932]"
          >
            {t("profile_guest_login_cta")}
          </button>
        </div>
        <Link href="/my" className="block text-center sam-text-body text-sam-muted">{t("common_back_to_mypage")}</Link>
      </div>
    );
  }

  const phoneVerificationStatus = (profile as ProfileRow & { phone_verification_status?: string })
    .phone_verification_status;

  const displayNickname = resolveDisplayName(profile) || t("account_nickname");
  const atUsername = formatAtUsername(profile.username ?? null);
  const displayPhone =
    formatProfilePhoneForDisplay({
      phone: profile.phone ?? null,
      phone_country_code: profile.phone_country_code ?? null,
      phone_number: profile.phone_number ?? null,
    }) || profile.phone?.trim() || t("account_missing_phone");
  const contactVerified = isProfileContactVerified(profile);
  const storeMemberStatus = deriveStoreMemberStatus(profile);
  const consentDone = hasStoreTermsConsent(profile);
  const profileCompleted = profile.profile_completed === true;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-[20px] border border-[#d9e5df] bg-white p-4 shadow-sm">
        <SamarketUserAvatar avatarUrl={profile.avatar_url} sizePx={64} badge={profileCompleted ? "verified" : "none"} alt="" />
        <div className="min-w-0 flex-1">
          <p className="sam-text-section-title font-semibold text-[#1e3932]">{displayNickname}</p>
          {atUsername ? (
            <p className="mt-0.5 truncate font-mono sam-text-xxs text-[#1e3932]/65 tabular-nums">{atUsername}</p>
          ) : null}
          <p className="mt-0.5 truncate sam-text-body-secondary text-[#1e3932]/70">
            {profileCompleted ? t("account_nickname_note") : t("profile_complete_desc")}
          </p>
          <Link href={MYPAGE_PROFILE_EDIT_HREF} className="mt-2 inline-block sam-text-body font-semibold text-[#006241]">
            {profileCompleted ? t("account_edit_profile") : t("profile_complete_cta")}
          </Link>
        </div>
      </div>

      <div className="rounded-ui-rect bg-sam-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="sam-text-body font-semibold text-sam-fg">{t("account_info_title")}</h2>
          <Link href={MYPAGE_PROFILE_EDIT_HREF} className="sam-text-body font-medium text-signature">
            {t("account_edit")}
          </Link>
        </div>
        <dl className="space-y-3 sam-text-body">
          <div>
            <dt className="text-sam-muted">{t("account_nickname")}</dt>
            <dd className="mt-0.5 text-sam-fg">{displayNickname}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("my_account_username")}</dt>
            <dd className="mt-0.5 font-mono text-sam-fg tabular-nums">{atUsername || "—"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("account_email")}</dt>
            <dd className="mt-0.5 text-sam-fg">{profile.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("account_phone")}</dt>
            <dd className="mt-0.5 text-sam-fg">{displayPhone}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("account_realname")}</dt>
            <dd className="mt-0.5 text-sam-fg">
              {profile.realname_verified ? t("account_verified") : t("account_unverified")}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("my_account_member_status")}</dt>
            <dd className="mt-0.5 text-sam-fg">{storeMemberStatus}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("account_phone_verification")}</dt>
            <dd className="mt-0.5 text-sam-fg">
              {contactVerified
                ? t("my_phone_status_verified")
                : phoneVerificationStatus === "pending"
                  ? t("account_pending")
                  : t("account_unverified")}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("my_account_terms")}</dt>
            <dd className="mt-0.5 text-sam-fg">
              {consentDone ? t("my_account_terms_done") : t("my_account_terms_required")}
            </dd>
          </div>
        </dl>
        {!contactVerified ? (
          <Link
            href="/my/account/phone-verification"
            className="mt-4 block rounded-ui-rect border border-signature/20 bg-signature/5 px-4 py-3 text-center sam-text-body font-semibold text-signature"
          >
            {t("account_phone_cta")}
          </Link>
        ) : null}
      </div>
      <ProfileVerificationCenter profile={profile} />
      <Link
        href={buildMypageInfoHubHref()}
        className="block rounded-ui-rect bg-sam-surface px-4 py-3 text-center sam-text-body font-medium text-sam-fg shadow-sm"
      >
        {t("account_to_settings")}
      </Link>
    </div>
  );
}
