"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOnboardingOverlayShell } from "@/components/auth/DibayOnboardingOverlayShell";
import { RegistrationStepEscape, RegistrationStepLaterButton } from "@/components/auth/RegistrationStepLater";
import { buildAddressEditHref } from "@/lib/auth/client-access-flow";
import { deferProfileSetupForSession } from "@/lib/auth/profile-setup-defer.client";
import { registrationStepHref } from "@/lib/auth/dibay-registration-steps";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";
import { DIBAY_ONBOARDING_PRIMARY_BTN } from "@/lib/ui/dibay-onboarding-styles";

/**
 * 가입 단계 — 대표 주소 등록. 주소 등록 방법은 기존 주소 흐름(`/mypage/addresses` → 검색·지도·저장) 그대로 —
 * `returnTo` 로 이 화면에 돌아오면 서버가 대표 주소를 다시 확인해 완료면 원래 화면(`next`)으로 보낸다.
 */
export function RegistrationAddressStep({ next }: { next: string }) {
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    deferProfileSetupForSession();
  }, []);

  const onRegister = useCallback(() => {
    const back = registrationStepHref("address", next) ?? "/auth/onboarding/address";
    router.push(buildAddressEditHref(back));
  }, [next, router]);

  const onLater = useCallback(() => {
    guardedRouterReplace(router, next, { source: "registration-address-step", reason: "later" });
  }, [next, router]);

  return (
    <DibayOnboardingOverlayShell
      title={t("auth_reg_address_title")}
      description={t("auth_reg_address_intro")}
      titleId="dibay-registration-address-title"
      descriptionId="dibay-registration-address-desc"
      footer={
        <>
          <button
            type="button"
            onClick={onRegister}
            className={DIBAY_ONBOARDING_PRIMARY_BTN}
            data-testid="registration-address-start"
          >
            {t("auth_reg_address_cta")}
          </button>
          <RegistrationStepLaterButton onLater={onLater} />
        </>
      }
    >
      <RegistrationStepEscape />
    </DibayOnboardingOverlayShell>
  );
}
