"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  RequiredInfoActiveStepPanel,
  type RequiredInfoPhoneSettings,
} from "@/components/mypage/required/RequiredInfoActiveStepPanel";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import {
  invalidateMandatoryAddressGateClientCache,
  readMandatoryAddressGateNeedsBlock,
} from "@/lib/addresses/mandatory-address-gate-client";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";
import {
  deriveRequiredInfoBundleFromProfile,
  isRequiredInfoBundleComplete,
  resolveFirstIncompleteStep,
  resolveRequiredInfoStepIndex,
  type RequiredInfoStep,
} from "@/lib/mypage/required-info-flow";
import { PROFILE_EDIT_PRIMARY_BTN_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";

export function RequiredInfoFlowClient() {
  const router = useRouter();
  const { t, safeT } = useI18n();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [hasDefaultAddress, setHasDefaultAddress] = useState(false);
  const [loading, setLoading] = useState(true);
  const [phoneSettings, setPhoneSettings] = useState<RequiredInfoPhoneSettings | null>(null);

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

      <RequiredInfoActiveStepPanel
        activeStep={activeStep}
        profile={profile}
        phoneSettings={phoneSettings}
        onDibayIdConfirmed={handleDibayIdConfirmed}
        onPhoneRefresh={handlePhoneRefresh}
        addressMode="link"
      />
    </div>
  );
}
