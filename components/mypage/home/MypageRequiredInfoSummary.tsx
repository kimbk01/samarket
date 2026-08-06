"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  RequiredInfoActiveStepPanel,
  type RequiredInfoPhoneSettings,
} from "@/components/mypage/required/RequiredInfoActiveStepPanel";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import {
  invalidateMandatoryAddressGateClientCache,
  readMandatoryAddressGateNeedsBlock,
} from "@/lib/addresses/mandatory-address-gate-client";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import {
  deriveRequiredInfoBundleFromProfile,
  isRequiredInfoBundleComplete,
  resolveFirstIncompleteStep,
  resolveRequiredInfoStepIndex,
} from "@/lib/mypage/required-info-flow";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

/**
 * Incomplete required info — inline inputs under manner battery (same methods as `/mypage/required`).
 * Complete → hide (manage via account / sheets). DO NOT fetch address-defaults here.
 */
export function MypageRequiredInfoSummary({
  projection,
  onProfileRefresh,
}: {
  projection: MypageHomeProjection | null;
  onProfileRefresh?: () => void;
}) {
  const { safeT } = useI18n();
  const { openSheet } = useMypageProfileSheets();
  const [profile, setProfile] = useState<ProfileRow | null>(projection?.profile ?? null);
  const [hasDefaultAddress, setHasDefaultAddress] = useState(
    projection?.addressStatus === "complete",
  );
  const [phoneSettings, setPhoneSettings] = useState<RequiredInfoPhoneSettings | null>(null);

  useEffect(() => {
    setProfile(projection?.profile ?? null);
    if (projection?.addressStatus === "complete") setHasDefaultAddress(true);
    if (projection?.addressStatus === "required") setHasDefaultAddress(false);
  }, [projection]);

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
          guideText: String(s.guide_text ?? ""),
          resendCooldownSeconds: Number(s.resend_cooldown_seconds ?? 60),
        });
      } else {
        setPhoneSettings(null);
      }
    } catch {
      setPhoneSettings(null);
    }
  }, []);

  const refreshLocal = useCallback(async () => {
    invalidateMeProfileDedupedCache();
    invalidateMandatoryAddressGateClientCache();
    const [fresh, needsBlock] = await Promise.all([
      getMyProfile(),
      readMandatoryAddressGateNeedsBlock(),
    ]);
    if (fresh) {
      setProfile(fresh);
      setSupabaseProfileCache(profileRowToClientProfile(fresh));
    }
    setHasDefaultAddress(!needsBlock);
    onProfileRefresh?.();
    return fresh;
  }, [onProfileRefresh]);

  useEffect(() => {
    if (!projection || projection.phoneStatus === "complete") return;
    void loadPhoneSettings();
  }, [loadPhoneSettings, projection]);

  useEffect(() => {
    const onAddressesUpdated = () => {
      invalidateMandatoryAddressGateClientCache();
      void refreshLocal();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [refreshLocal]);

  const bundle = useMemo(
    () => deriveRequiredInfoBundleFromProfile(profile, { hasDefaultAddress }),
    [hasDefaultAddress, profile],
  );

  const activeStep = useMemo(() => resolveFirstIncompleteStep(bundle), [bundle]);
  const bundleComplete = isRequiredInfoBundleComplete(bundle);

  const handleDibayIdConfirmed = useCallback(
    async (confirmedDibayId: string) => {
      if (!confirmedDibayId.trim()) return;
      await refreshLocal();
    },
    [refreshLocal],
  );

  const handlePhoneRefresh = useCallback(async () => {
    const fresh = await refreshLocal();
    await loadPhoneSettings();
    if (fresh && hasVerifiedPhone(fresh)) return;
  }, [loadPhoneSettings, refreshLocal]);

  const knownFromProjection =
    !!projection &&
    projection.phoneStatus !== "unknown" &&
    projection.addressStatus !== "unknown";

  /** Complete → hide home card (account / sheets own edits). */
  if (bundleComplete) {
    return null;
  }

  /** Still resolving projection — no form flash. */
  if (!projection || !profile || !knownFromProjection) {
    return (
      <section
        className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`}
        data-testid="mypage-required-info-card"
        data-state="checking"
      >
        <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} space-y-2.5`}>
          <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
            {safeT("mypage_required_section_title", {
              fallbackKo: "필수 정보",
              fallbackEn: "Required info",
            })}
          </h2>
          <p className="text-[13px] leading-snug text-[#6F4E37]">
            {safeT("mypage_required_checking_desc", {
              fallbackKo: "필수 정보 상태를 확인하고 있습니다.",
              fallbackEn: "Checking required info status.",
            })}
          </p>
        </div>
      </section>
    );
  }

  if (!activeStep) {
    return null;
  }

  const stepIndex = resolveRequiredInfoStepIndex(activeStep);
  const stepTitle =
    activeStep === "dibay-id"
      ? safeT("mypage_required_dibay_id", { fallbackKo: "아이디", fallbackEn: "ID" })
      : activeStep === "phone"
        ? safeT("mypage_required_phone", { fallbackKo: "전화번호", fallbackEn: "Phone" })
        : safeT("mypage_required_address", { fallbackKo: "기본 주소", fallbackEn: "Default address" });

  return (
    <section
      className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`}
      data-testid="mypage-required-info-card"
      data-state="incomplete"
      data-active-step={activeStep}
    >
      <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} space-y-2.5`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
            {safeT("mypage_required_section_title", {
              fallbackKo: "필수 정보",
              fallbackEn: "Required info",
            })}
          </h2>
          <span
            className="rounded-full bg-[#FDECEC] px-2.5 py-1 text-[12px] font-bold text-[#C62828]"
            data-testid="required-info-flow-progress"
          >
            {stepIndex}/3
          </span>
        </div>
        <p className="text-[13px] leading-snug text-[#6F4E37]">
          {safeT("mypage_required_incomplete_desc", {
            fallbackKo: "서비스 이용을 위해 아래 항목을 완료해 주세요.",
            fallbackEn: "Complete the required items below to continue using the service.",
          })}
        </p>
        <p className="text-[14px] font-semibold text-[#1E3932]">{stepTitle}</p>
      </div>

      <div className="space-y-3 px-3 pb-4 pt-1">
        <RequiredInfoActiveStepPanel
          activeStep={activeStep}
          profile={profile}
          phoneSettings={phoneSettings}
          onDibayIdConfirmed={handleDibayIdConfirmed}
          onPhoneRefresh={handlePhoneRefresh}
          addressMode="sheet"
          onAddressOpen={() => openSheet("address")}
        />
      </div>
    </section>
  );
}
