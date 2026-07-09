"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ProfileDibayIdSection } from "@/components/my/edit/ProfileDibayIdSection";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { invalidateMandatoryAddressGateClientCache, readMandatoryAddressGateNeedsBlock } from "@/lib/addresses/mandatory-address-gate-client";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";
import {
  buildRequiredInfoAddressHref,
  deriveRequiredInfoBundleFromProfile,
  isRequiredInfoBundleComplete,
  resolveFirstIncompleteStep,
  resolveRequiredInfoStepIndex,
  type RequiredInfoStep,
} from "@/lib/mypage/required-info-flow";
import {
  PROFILE_EDIT_PRIMARY_BTN_CLASS,
} from "@/lib/ui/profile-edit-starbucks-styles";

type PhoneSettings = {
  enabled: boolean;
  provider: "supabase" | "semaphore";
  guideText: string;
  resendCooldownSeconds: number;
};

export function RequiredInfoFlowClient() {
  const router = useRouter();
  const { t, safeT } = useI18n();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [hasDefaultAddress, setHasDefaultAddress] = useState(false);
  const [loading, setLoading] = useState(true);
  const [phoneSettings, setPhoneSettings] = useState<PhoneSettings | null>(null);

  const refreshBundle = useCallback(async () => {
    const [p, needsBlock] = await Promise.all([
      getMyProfile(),
      readMandatoryAddressGateNeedsBlock(),
    ]);
    setProfile(p);
    setHasDefaultAddress(!needsBlock);
    return { profile: p, hasDefaultAddress: !needsBlock };
  }, []);

  const loadPhoneSettings = useCallback(async () => {
    try {
      const settingsRes = await runSingleFlight("me:phone-verification:get", () =>
        fetch("/api/me/phone-verification", { credentials: "include", cache: "no-store" }),
      );
      const j = (await settingsRes.json()) as {
        ok?: boolean;
        verification?: {
          settings?: {
            enabled?: boolean;
            provider?: string;
            guide_text?: string;
            resend_cooldown_seconds?: number;
          };
        };
      };
      const s = j?.verification?.settings;
      if (j?.ok && s) {
        setPhoneSettings({
          enabled: s.enabled === true,
          provider: (s.provider === "semaphore" ? "semaphore" : "supabase") as "supabase" | "semaphore",
          guideText: String(s["guide_text"] ?? ""),
          resendCooldownSeconds: Number(s["resend_cooldown_seconds"] ?? 60),
        });
      } else {
        setPhoneSettings(null);
      }
    } catch {
      setPhoneSettings(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([refreshBundle(), loadPhoneSettings()]);
    setLoading(false);
  }, [loadPhoneSettings, refreshBundle]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onAddressesUpdated = () => {
      invalidateMandatoryAddressGateClientCache();
      void refreshBundle();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [refreshBundle]);

  const bundle = useMemo(
    () => deriveRequiredInfoBundleFromProfile(profile, { hasDefaultAddress }),
    [hasDefaultAddress, profile],
  );

  const activeStep = useMemo(() => resolveFirstIncompleteStep(bundle), [bundle]);
  const bundleComplete = isRequiredInfoBundleComplete(bundle);

  const phoneSnapshot = useMemo(() => {
    if (!profile) return null;
    return {
      phone: profile.phone ?? null,
      ["phone_country_code"]: profile.phone_country_code ?? null,
      ["phone_number"]: profile.phone_number ?? null,
      ["phone_verified"]: profile.phone_verified === true,
      ["phone_verified_at"]: profile.phone_verified_at ?? null,
      ["phone_verification_status"]: profile.phone_verification_status ?? null,
      ["member_status"]: profile.member_status ?? null,
      role: profile.role ?? null,
      email: profile.auth_login_email ?? profile.email ?? null,
      provider: profile.provider ?? profile.auth_provider ?? null,
      ["auth_provider"]: profile.auth_provider ?? profile.provider ?? null,
      settings: phoneSettings
        ? {
            enabled: phoneSettings.enabled,
            provider: phoneSettings.provider,
            ["guide_text"]: phoneSettings.guideText,
            ["resend_cooldown_seconds"]: phoneSettings.resendCooldownSeconds,
          }
        : undefined,
    };
  }, [phoneSettings, profile]);

  const handleDibayIdConfirmed = useCallback(
    async (confirmedDibayId: string) => {
      if (!confirmedDibayId.trim()) return;
      invalidateMeProfileDedupedCache();
      const fresh = await getMyProfile();
      if (fresh) {
        setProfile(fresh);
        setSupabaseProfileCache(profileRowToClientProfile(fresh));
      }
      invalidateMandatoryAddressGateClientCache();
      const needsBlock = await readMandatoryAddressGateNeedsBlock();
      setHasDefaultAddress(!needsBlock);
    },
    [],
  );

  const handlePhoneRefresh = useCallback(async () => {
    invalidateMeProfileDedupedCache();
    invalidateMandatoryAddressGateClientCache();
    const { profile: fresh } = await refreshBundle();
    await loadPhoneSettings();
    if (fresh && hasVerifiedPhone(fresh)) {
      return;
    }
  }, [loadPhoneSettings, refreshBundle]);

  const progressLabel = useMemo(() => {
    if (bundleComplete || !activeStep) {
      return safeT("mypage_required_progress_complete", {
        fallbackKo: "완료",
        fallbackEn: "Complete",
      });
    }
    const index = resolveRequiredInfoStepIndex(activeStep);
    return `${index}/3`;
  }, [activeStep, bundleComplete, safeT]);

  const stepTitle = useCallback(
    (step: RequiredInfoStep) => {
      switch (step) {
        case "dibay-id":
          return safeT("mypage_required_dibay_id", { fallbackKo: "@아이디", fallbackEn: "@ ID" });
        case "phone":
          return safeT("mypage_required_phone", { fallbackKo: "전화번호", fallbackEn: "Phone" });
        case "address":
          return safeT("mypage_required_address", { fallbackKo: "기본 주소", fallbackEn: "Default address" });
      }
    },
    [safeT],
  );

  if (loading || !profile) {
    return (
      <p className="py-10 text-center sam-text-body text-sam-muted" data-testid="required-info-flow-loading">
        {t("common_loading")}
      </p>
    );
  }

  if (bundleComplete || activeStep === null) {
    return (
      <div
        className="flex flex-col gap-4 px-4 py-6 sm:px-5"
        data-testid="required-info-flow-step"
        data-step="done"
      >
        <p className="sam-text-body font-semibold text-sam-fg">
          {safeT("mypage_required_flow_done_title", {
            fallbackKo: "필수정보 등록이 완료되었습니다",
            fallbackEn: "Required info is complete",
          })}
        </p>
        <button
          type="button"
          className={PROFILE_EDIT_PRIMARY_BTN_CLASS}
          onClick={() => router.replace(MYPAGE_MAIN_HREF)}
        >
          {safeT("mypage_required_flow_done_confirm", {
            fallbackKo: "확인",
            fallbackEn: "OK",
          })}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="sam-text-body font-semibold text-sam-fg">{stepTitle(activeStep)}</p>
        <span
          className="inline-flex shrink-0 rounded-full bg-[#F2F0EB] px-2.5 py-1 text-[12px] font-bold text-[#6F4E37]"
          data-testid="required-info-flow-progress"
        >
          {progressLabel}
        </span>
      </div>

      {activeStep === "dibay-id" ? (
        <div data-testid="required-info-flow-step" data-step="dibay-id">
          <ProfileDibayIdSection
            dibay_id={profile.dibay_id ?? null}
            dibay_id_locked={profile.dibay_id_locked === true}
            dibay_id_auto_assigned={profile.dibay_id_auto_assigned === true}
            dibay_id_changed_once={profile.dibay_id_changed_once === true}
            username={profile.username ?? profile.dibay_id ?? null}
            username_confirmed={profile.username_confirmed ?? null}
            onConfirmed={handleDibayIdConfirmed}
          />
        </div>
      ) : null}

      {activeStep === "phone" && phoneSnapshot ? (
        <div data-testid="required-info-flow-step" data-step="phone">
          {phoneSettings && !phoneSettings.enabled ? (
            <p className="sam-text-body text-sam-muted">{t("mypage_comp_phone_verify_disabled")}</p>
          ) : (
            <PhoneVerificationBox snapshot={phoneSnapshot} onRefreshProfile={handlePhoneRefresh} />
          )}
        </div>
      ) : null}

      {activeStep === "address" ? (
        <div
          className="flex flex-col gap-4"
          data-testid="required-info-flow-step"
          data-step="address"
        >
          <p className="sam-text-body text-sam-muted">
            {safeT("mypage_required_flow_address_body", {
              fallbackKo: "대표 주소를 등록해 주세요",
              fallbackEn: "Add your default address",
            })}
          </p>
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
          <p className="sam-text-helper text-sam-muted">
            {safeT("mypage_required_flow_address_return_hint", {
              fallbackKo: "주소 등록 후 이 화면으로 돌아오면 다음 단계가 이어집니다.",
              fallbackEn: "Return here after adding your address to continue.",
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
