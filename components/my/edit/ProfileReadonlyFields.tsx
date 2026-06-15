"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OAuthLoginProviderIcon } from "@/components/auth/OAuthLoginProviderVisuals";
import { normalizeOAuthProvider, type OAuthProvider } from "@/lib/auth/auth-providers";
import {
  isProfileContactVerified,
  resolveProfileLoginEmail,
} from "@/lib/profile/profile-contact-verification-ui";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import type { ProfileRow } from "@/lib/profile/types";

const VERIFIED_VALUE_CLASS = "text-[#00704A]";
const UNVERIFIED_VALUE_CLASS = "text-red-700";

function resolveProfileAuthProvider(profile: ProfileRow): OAuthProvider | "email" {
  const raw = (profile.auth_provider ?? profile.provider ?? "").trim().toLowerCase();
  const oauth = normalizeOAuthProvider(raw);
  if (oauth) return oauth;
  return "email";
}

function profileAuthProviderBadgeClass(provider: OAuthProvider | "email"): string {
  if (provider === "kakao") return "bg-[#FEE500]";
  if (provider === "naver") return "bg-[#03C75A]";
  if (provider === "apple") return "bg-black";
  if (provider === "google") return "border border-[#dadce0] bg-white";
  if (provider === "facebook") return "bg-[#1877F2]";
  return "bg-[#00704A]";
}

function ProfileAuthProviderBadge({ provider }: { provider: OAuthProvider | "email" }) {
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${profileAuthProviderBadgeClass(provider)}`}
      aria-hidden
    >
      <OAuthLoginProviderIcon provider={provider} size="secondary" />
    </span>
  );
}

function ReadonlyRow({
  label,
  value,
  valueClassName,
  leading,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  leading?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
      <span className="shrink-0 text-[13px] text-[#6F4E37]">{label}</span>
      <div className="flex min-w-0 items-center justify-end gap-2">
        {leading}
        <span
          className={`min-w-0 truncate text-right text-[14px] font-medium ${valueClassName ?? "text-[#1E3932]"}`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export function ProfileReadonlyFields({ profile }: { profile: ProfileRow }) {
  const { t, safeT } = useI18n();
  const contactVerified = isProfileContactVerified(profile);

  const loginEmail = resolveProfileLoginEmail(profile);
  const authProvider = resolveProfileAuthProvider(profile);
  const showAuthProviderBadge = loginEmail !== "—";

  const verifiedLabel = safeT("my_phone_status_verified", {
    fallbackKo: "인증 완료",
    fallbackEn: "Verified",
  });
  const phoneVerificationLabel = safeT("profile_edit_phone_verification_label", {
    fallbackKo: "전화 번호 인증",
    fallbackEn: "Phone verification",
  });
  const unverifiedLabel = safeT("account_unverified", {
    fallbackKo: "미인증",
    fallbackEn: "Not verified",
  });
  const pendingLabel = safeT("account_pending", {
    fallbackKo: "승인 대기",
    fallbackEn: "Pending",
  });

  const phonePending = !contactVerified && profile.phone_verification_status === "pending";
  const phoneStatus = contactVerified ? verifiedLabel : phonePending ? pendingLabel : unverifiedLabel;

  const verifiedPhoneDisplay = formatProfilePhoneForDisplay(profile);

  return (
    <div className="divide-y divide-[#D4E9E2]/80">
      <ReadonlyRow
        label={t("account_email")}
        value={loginEmail}
        leading={showAuthProviderBadge ? <ProfileAuthProviderBadge provider={authProvider} /> : null}
      />
      <ReadonlyRow
        label={t("account_realname")}
        value={contactVerified ? verifiedLabel : unverifiedLabel}
        valueClassName={contactVerified ? VERIFIED_VALUE_CLASS : UNVERIFIED_VALUE_CLASS}
      />
      <ReadonlyRow
        label={phoneVerificationLabel}
        value={phoneStatus}
        valueClassName={
          contactVerified ? VERIFIED_VALUE_CLASS : phonePending ? "text-[#6F4E37]" : UNVERIFIED_VALUE_CLASS
        }
      />
      {contactVerified && verifiedPhoneDisplay ? (
        <ReadonlyRow label={t("profile_edit_contact_label")} value={verifiedPhoneDisplay} />
      ) : null}
      <ReadonlyRow label={t("profile_edit_member_tier")} value={profile.role} />
      <ReadonlyRow label={t("profile_edit_points")} value={String(profile.points)} />
    </div>
  );
}
