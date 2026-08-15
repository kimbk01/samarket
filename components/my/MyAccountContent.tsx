"use client";

import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import {
  MYPAGE_ADDRESSES_HREF,
  MYPAGE_REQUIRED_DIBAY_ID_HREF,
} from "@/lib/mypage/mypage-profile-routes";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { isProfileContactVerified } from "@/lib/profile/profile-contact-verification-ui";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import {
  deriveStoreMemberStatus,
  hasStoreTermsConsent,
  type StoreMemberStatus,
} from "@/lib/auth/store-member-policy";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";
import { ProfileVerificationCenter } from "@/components/profile/ProfileVerificationCenter";
import { buildPhoneVerificationHref } from "@/lib/auth/client-access-flow";
import { useRepresentativeFullAddressLine } from "@/hooks/use-representative-address-line";
import { evaluatePublicIdProfileView, resolvePublicIdAtDisplay } from "@/lib/auth/dibay-public-id-ssot";
import type { MessageKey } from "@/lib/i18n/messages";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

function statusBadgeClass(done: boolean): string {
  return done
    ? "bg-[rgba(0,130,72,0.12)] text-[#008248]"
    : "bg-[rgba(245,158,11,0.12)] text-[#b45309]";
}

function memberStatusMessageKey(status: StoreMemberStatus): MessageKey {
  switch (status) {
    case "verified_member":
      return "account_member_status_verified_member";
    case "sns_member":
      return "account_member_status_sns_member";
    case "admin_manual":
      return "account_member_status_admin_manual";
    case "admin":
      return "account_member_status_admin";
    case "guest":
    default:
      return "account_member_status_guest";
  }
}

export function MyAccountContent() {
  const { t } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const addressState = useRepresentativeFullAddressLine();

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
        <Link href="/mypage" className="block text-center sam-text-body text-sam-muted">
          {t("common_back_to_mypage")}
        </Link>
      </div>
    );
  }

  const phoneVerificationStatus = (profile as ProfileRow & { phone_verification_status?: string })
    .phone_verification_status;

  const displayNickname = resolveDisplayName(profile) || t("account_nickname");
  const atUsername = formatAtUsername(profile.username ?? null);
  const publicIdView = evaluatePublicIdProfileView(profile);
  const dibayIdDisplay =
    resolvePublicIdAtDisplay(profile)?.trim() ||
    profile.username?.trim() ||
    "";
  const hasDibayId = Boolean(dibayIdDisplay);
  const displayPhone =
    formatProfilePhoneForDisplay({
      phone: profile.phone ?? null,
      phone_country_code: profile.phone_country_code ?? null,
      phone_number: profile.phone_number ?? null,
    }) ||
    profile.phone?.trim() ||
    "";
  const contactVerified = isProfileContactVerified(profile);
  const storeMemberStatus = deriveStoreMemberStatus(profile);
  const consentDone = hasStoreTermsConsent(profile);
  const profileCompleted = profile.profile_completed === true;
  const addressLine = addressState.status === "ready" ? addressState.line?.trim() ?? "" : "";
  const addressDone = Boolean(addressLine?.trim());

  const essentials = [
    {
      key: "dibay-id",
      title: t("account_essentials_id"),
      desc: hasDibayId
        ? atUsername || `@${dibayIdDisplay}`
        : t("account_essentials_id_needed"),
      done: hasDibayId,
      badge: hasDibayId ? t("account_essentials_done") : t("account_essentials_needed"),
      href: hasDibayId && !publicIdView.canChangeOnce ? MYPAGE_PROFILE_EDIT_HREF : MYPAGE_REQUIRED_DIBAY_ID_HREF,
    },
    {
      key: "phone",
      title: t("profile_verification_phone"),
      desc: contactVerified
        ? displayPhone || t("profile_verification_phone_done")
        : t("account_essentials_phone_needed"),
      done: contactVerified,
      badge: contactVerified ? t("profile_verification_done") : t("profile_verification_needed"),
      href: buildPhoneVerificationHref(),
    },
    {
      key: "address",
      title: t("profile_verification_address"),
      desc: addressDone
        ? addressLine
        : addressState.status === "ready"
          ? t("profile_verification_address_needed")
          : t("common_loading"),
      done: addressDone,
      badge: addressDone
        ? t("profile_verification_address_done")
        : t("profile_verification_address_needed_short"),
      href: MYPAGE_ADDRESSES_HREF,
    },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-[20px] border border-[#d9e5df] bg-white p-4 shadow-sm">
        <SamarketUserAvatar
          avatarUrl={profile.avatar_url}
          sizePx={64}
          badge={profileCompleted ? "verified" : "none"}
          alt=""
        />
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

      <section
        className="rounded-[20px] border border-[#d9e5df] bg-white p-4 shadow-sm"
        data-testid="account-essentials-block"
      >
        <h2 className="sam-text-section-title font-semibold text-[#1e3932]">
          {t("account_essentials_title")}
        </h2>
        <p className="mt-1 sam-text-body-secondary text-[#1e3932]/70">
          {t("account_essentials_desc")}
        </p>
        <div className="mt-3 divide-y divide-[#d9e5df]">
          {essentials.map((row) => {
            const inner = (
              <>
                <span className="flex min-w-0 items-start gap-2">
                  {row.key === "address" ? (
                    <AddressKindHeadPin kind="master" className="mt-0.5 h-5 w-5 shrink-0 [&_svg]:h-5 [&_svg]:w-[1rem]" />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block sam-text-body font-semibold text-[#1e3932]">{row.title}</span>
                    <span className="mt-0.5 block truncate sam-text-body-secondary text-[#1e3932]/65">{row.desc}</span>
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 sam-text-xxs font-semibold ${statusBadgeClass(row.done)}`}>
                  {row.badge}
                </span>
              </>
            );
            const className = "flex w-full items-center justify-between gap-3 py-3 text-left active:opacity-90";
            return row.key === "address" ? (
              <button key={row.key} type="button" onClick={() => router.push(row.href)} className={className}>
                {inner}
              </button>
            ) : (
              <Link key={row.key} href={row.href} className={className}>
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="sam-text-section-title font-semibold text-sam-fg">{t("account_info_title")}</h2>
          <Link href={MYPAGE_PROFILE_EDIT_HREF} className="sam-text-body font-semibold text-signature">
            {t("account_edit")}
          </Link>
        </div>
        <dl className="space-y-4">
          {(
            [
              { label: t("account_nickname"), value: displayNickname },
              { label: t("my_account_username"), value: atUsername || "—", mono: true },
              { label: t("account_email"), value: profile.email ?? "—" },
              { label: t("account_phone"), value: displayPhone || t("account_missing_phone") },
              {
                label: t("account_realname"),
                value: profile.realname_verified ? t("account_verified") : t("account_unverified"),
              },
              {
                label: t("my_account_member_status"),
                value: t(memberStatusMessageKey(storeMemberStatus)),
              },
              {
                label: t("account_phone_verification"),
                value: contactVerified
                  ? t("my_phone_status_verified")
                  : phoneVerificationStatus === "pending"
                    ? t("account_pending")
                    : t("account_unverified"),
              },
              {
                label: t("my_account_terms"),
                value: consentDone ? t("my_account_terms_done") : t("my_account_terms_required"),
              },
            ] as const
          ).map((row) => (
            <div key={row.label} className="border-b border-sam-border/60 pb-3 last:border-b-0 last:pb-0">
              <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-sam-muted">{row.label}</dt>
              <dd
                className={`mt-1 sam-text-body font-semibold text-sam-fg ${"mono" in row && row.mono ? "font-mono tabular-nums" : ""}`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {!contactVerified ? (
          <Link
            href="/mypage/required/phone"
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
