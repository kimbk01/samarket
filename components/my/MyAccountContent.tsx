"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";
import { hasFormalMemberContactVerification } from "@/lib/auth/member-access";
import { deriveStoreMemberStatus, hasStoreTermsConsent } from "@/lib/auth/store-member-policy";

export function MyAccountContent() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const p = await getMyProfile();
    setProfile(p);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="py-4 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }
  if (!profile) {
    return (
      <div className="space-y-3 py-4 text-center sam-text-body text-sam-muted">
        <p>{t("common_login_required")}</p>
        <p>
          <Link href="/login" className="font-medium text-signature underline">
            {t("common_login")}
          </Link>
        </p>
        <Link href="/my" className="block text-sam-muted">{t("common_back_to_mypage")}</Link>
      </div>
    );
  }

  const phoneVerificationStatus = (profile as ProfileRow & { phone_verification_status?: string })
    .phone_verification_status;

  const displayNickname = profile.nickname?.trim() || t("account_nickname");
  const contactFormal = hasFormalMemberContactVerification({
    phone_verified: profile.phone_verified || Boolean(profile.phone_verified_at),
    phone_verified_at: profile.phone_verified_at,
    provider: profile.provider ?? profile.auth_provider,
    auth_provider: profile.provider ?? profile.auth_provider,
    email: profile.email,
  });
  const storeMemberStatus = deriveStoreMemberStatus(profile);
  const consentDone = hasStoreTermsConsent(profile);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-sam-surface-muted">
          <Image
            src={withDefaultAvatar(profile.avatar_url)}
            alt=""
            fill
            className="object-cover"
            sizes="64px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="sam-text-section-title font-semibold text-sam-fg">{displayNickname}</p>
          <p className="mt-0.5 truncate sam-text-body-secondary text-sam-muted">{t("account_nickname_note")}</p>
          <Link href={MYPAGE_PROFILE_EDIT_HREF} className="mt-2 inline-block sam-text-body font-medium text-signature">
            {t("account_edit_profile")}
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
            <dt className="text-sam-muted">{t("account_email")}</dt>
            <dd className="mt-0.5 text-sam-fg">{profile.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("account_phone")}</dt>
            <dd className="mt-0.5 text-sam-fg">{profile.phone ?? t("account_missing_phone")}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("account_realname")}</dt>
            <dd className="mt-0.5 text-sam-fg">
              {profile.realname_verified ? t("account_verified") : t("account_unverified")}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">회원 상태</dt>
            <dd className="mt-0.5 text-sam-fg">{storeMemberStatus}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("account_phone_verification")}</dt>
            <dd className="mt-0.5 text-sam-fg">
              {contactFormal
                ? t("account_verified")
                : phoneVerificationStatus === "pending"
                  ? t("account_pending")
                  : t("account_unverified")}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">약관 동의</dt>
            <dd className="mt-0.5 text-sam-fg">{consentDone ? "완료" : "필요"}</dd>
          </div>
        </dl>
        {!contactFormal ? (
          <Link
            href="/my/account/phone-verification"
            className="mt-4 block rounded-ui-rect border border-signature/20 bg-signature/5 px-4 py-3 text-center sam-text-body font-semibold text-signature"
          >
            {t("account_phone_cta")}
          </Link>
        ) : null}
      </div>
      <Link
        href={buildMypageInfoHubHref()}
        className="block rounded-ui-rect bg-sam-surface px-4 py-3 text-center sam-text-body font-medium text-sam-fg shadow-sm"
      >
        {t("account_to_settings")}
      </Link>
    </div>
  );
}
