"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ProfileDibayIdSection } from "@/components/my/edit/ProfileDibayIdSection";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import type { ProfileRow } from "@/lib/profile/types";
import {
  buildRequiredInfoAddressHref,
  type RequiredInfoStep,
} from "@/lib/mypage/required-info-flow";
import { PROFILE_EDIT_PRIMARY_BTN_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";

export type RequiredInfoPhoneSettings = {
  enabled: boolean;
  provider: "supabase" | "semaphore";
  guideText: string;
  resendCooldownSeconds: number;
};

type PhoneSnapshot = {
  phone: string | null;
  phone_country_code?: string | null;
  phone_number?: string | null;
  phone_verified: boolean;
  phone_verified_at?: string | null;
  phone_verification_status?: string | null;
  member_status?: string | null;
  role?: string | null;
  email?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
  settings?: {
    enabled: boolean;
    provider: "supabase" | "semaphore";
    guide_text: string;
    resend_cooldown_seconds: number;
  };
};

export function buildRequiredInfoPhoneSnapshot(
  profile: ProfileRow,
  phoneSettings: RequiredInfoPhoneSettings | null,
): PhoneSnapshot {
  return {
    phone: profile.phone ?? null,
    phone_country_code: profile.phone_country_code ?? null,
    phone_number: profile.phone_number ?? null,
    phone_verified: profile.phone_verified === true,
    phone_verified_at: profile.phone_verified_at ?? null,
    phone_verification_status: profile.phone_verification_status ?? null,
    member_status: profile.member_status ?? null,
    role: profile.role ?? null,
    email: profile.auth_login_email ?? profile.email ?? null,
    provider: profile.provider ?? profile.auth_provider ?? null,
    auth_provider: profile.auth_provider ?? profile.provider ?? null,
    settings: phoneSettings
      ? {
          enabled: phoneSettings.enabled,
          provider: phoneSettings.provider,
          guide_text: phoneSettings.guideText,
          resend_cooldown_seconds: phoneSettings.resendCooldownSeconds,
        }
      : undefined,
  };
}

/**
 * Shared active-step inputs for required info (dibay id · phone OTP · address).
 * Used by `/mypage/required` flow and home incomplete panel — same input methods.
 */
export function RequiredInfoActiveStepPanel({
  activeStep,
  profile,
  phoneSettings,
  onDibayIdConfirmed,
  onPhoneRefresh,
  addressMode = "link",
  onAddressOpen,
}: {
  activeStep: RequiredInfoStep;
  profile: ProfileRow;
  phoneSettings: RequiredInfoPhoneSettings | null;
  onDibayIdConfirmed: (confirmedDibayId: string) => void | Promise<void>;
  onPhoneRefresh: () => Promise<void>;
  /** Home can open address sheet; dedicated flow keeps returnTo link. */
  addressMode?: "link" | "sheet";
  onAddressOpen?: () => void;
}) {
  const { t, safeT } = useI18n();
  const phoneSnapshot = buildRequiredInfoPhoneSnapshot(profile, phoneSettings);

  if (activeStep === "dibay-id") {
    return (
      <div data-testid="required-info-flow-step" data-step="dibay-id">
        <ProfileDibayIdSection
          dibay_id={profile.dibay_id ?? null}
          dibay_id_locked={profile.dibay_id_locked === true}
          dibay_id_auto_assigned={profile.dibay_id_auto_assigned === true}
          dibay_id_changed_once={profile.dibay_id_changed_once === true}
          username={profile.username ?? profile.dibay_id ?? null}
          username_confirmed={profile.username_confirmed ?? null}
          onConfirmed={onDibayIdConfirmed}
        />
      </div>
    );
  }

  if (activeStep === "phone") {
    return (
      <div data-testid="required-info-flow-step" data-step="phone">
        {phoneSettings && !phoneSettings.enabled ? (
          <p className="sam-text-body text-sam-muted">{t("mypage_comp_phone_verify_disabled")}</p>
        ) : (
          <PhoneVerificationBox snapshot={phoneSnapshot} onRefreshProfile={onPhoneRefresh} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="required-info-flow-step" data-step="address">
      <p className="sam-text-body text-sam-muted">
        {safeT("mypage_required_flow_address_body", {
          fallbackKo: "대표 주소를 등록해 주세요",
          fallbackEn: "Add your default address",
        })}
      </p>
      {addressMode === "sheet" && onAddressOpen ? (
        <button
          type="button"
          className={`${PROFILE_EDIT_PRIMARY_BTN_CLASS} inline-flex items-center justify-center`}
          data-testid="required-info-flow-address-cta"
          onClick={onAddressOpen}
        >
          {safeT("mypage_required_flow_address_cta", {
            fallbackKo: "주소 등록하기",
            fallbackEn: "Add address",
          })}
        </button>
      ) : (
        <Link
          href={buildRequiredInfoAddressHref()}
          className={`${PROFILE_EDIT_PRIMARY_BTN_CLASS} inline-flex items-center justify-center`}
          data-testid="required-info-flow-address-cta"
        >
          {safeT("mypage_required_flow_address_cta", {
            fallbackKo: "주소 등록하기",
            fallbackEn: "Add address",
          })}
        </Link>
      )}
      <p className="sam-text-helper text-sam-muted">
        {safeT("mypage_required_flow_address_return_hint", {
          fallbackKo: "주소 등록 후 이 화면으로 돌아오면 다음 단계가 이어집니다.",
          fallbackEn: "Return here after adding your address to continue.",
        })}
      </p>
    </div>
  );
}
