"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { isTestUsersSurfaceEnabled } from "@/lib/config/test-users-surface";
import type { ProfileRow } from "@/lib/profile/types";

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
    return <p className="py-4 text-center text-[14px] text-gray-500">{t("common_loading")}</p>;
  }
  if (!profile) {
    return (
      <div className="space-y-3 py-4 text-center text-[14px] text-gray-500">
        <p>{t("common_login_required")}</p>
        <p>
          <Link href="/login" className="font-medium text-signature underline">
            {isTestUsersSurfaceEnabled() ? "테스트 로그인" : t("common_login")}
          </Link>
          {isTestUsersSurfaceEnabled() ? (
            <>
              {" · "}
              <Link href="/signup" className="font-medium text-signature underline">
                {t("common_signup")}
              </Link>
            </>
          ) : null}
        </p>
        <Link href="/my" className="block text-gray-500">{t("common_back_to_mypage")}</Link>
      </div>
    );
  }

  const phoneVerificationStatus = (profile as ProfileRow & { phone_verification_status?: string })
    .phone_verification_status;

  const displayNickname = profile.nickname?.trim() || t("account_nickname");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gray-100">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt=""
              fill
              className="object-cover"
              sizes="64px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[26px] text-gray-400">👤</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-gray-900">{displayNickname}</p>
          <p className="mt-0.5 truncate text-[13px] text-gray-500">{t("account_nickname_note")}</p>
          <Link href="/my/edit" className="mt-2 inline-block text-[14px] font-medium text-signature">
            {t("account_edit_profile")}
          </Link>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-gray-900">{t("account_info_title")}</h2>
          <Link
            href="/my/edit"
            className="text-[14px] font-medium text-signature"
          >
            {t("account_edit")}
          </Link>
        </div>
        <dl className="space-y-3 text-[14px]">
          <div>
            <dt className="text-gray-500">{t("account_nickname")}</dt>
            <dd className="mt-0.5 text-gray-900">{displayNickname}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{t("account_email")}</dt>
            <dd className="mt-0.5 text-gray-900">{profile.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{t("account_phone")}</dt>
            <dd className="mt-0.5 text-gray-900">{profile.phone ?? t("account_missing_phone")}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{t("account_realname")}</dt>
            <dd className="mt-0.5 text-gray-900">
              {profile.realname_verified ? t("account_verified") : t("account_unverified")}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">{t("account_phone_verification")}</dt>
            <dd className="mt-0.5 text-gray-900">
              {profile.phone_verified
                ? t("account_verified")
                : phoneVerificationStatus === "pending"
                  ? t("account_pending")
                  : t("account_unverified")}
            </dd>
          </div>
        </dl>
        {!profile.phone_verified ? (
          <Link
            href="/my/account/phone-verification"
            className="mt-4 block rounded-xl border border-signature/20 bg-signature/5 px-4 py-3 text-center text-[14px] font-semibold text-signature"
          >
            {t("account_phone_cta")}
          </Link>
        ) : null}
      </div>
      <Link
        href={buildMypageInfoHubHref()}
        className="block rounded-xl bg-white px-4 py-3 text-center text-[14px] font-medium text-gray-700 shadow-sm"
      >
        {t("account_to_settings")}
      </Link>
    </div>
  );
}
