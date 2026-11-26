"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { RegistrationPageShell } from "@/components/auth/RegistrationPageShell";
import { MY_STICKY_CTA_PRIMARY_BUTTON_CLASS } from "@/components/mypage/ds/MyStickyCta";
import { buildAddressEditHref } from "@/lib/auth/client-access-flow";
import { DIBAY_REGISTRATION_STEP_PATH, registrationStepHref } from "@/lib/auth/dibay-registration-steps";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";

/**
 * 가입 단계 — 대표 주소 등록. 주소 등록 방법은 기존 주소 흐름(`/mypage/addresses` → 검색·지도·저장) 그대로 —
 * `returnTo` 로 이 화면에 돌아오면 서버가 대표 주소를 다시 확인해 완료면 원래 화면(`next`)으로 보낸다.
 */
export function RegistrationAddressStep({ next }: { next: string }) {
  const { t } = useI18n();
  const router = useRouter();
  /** 연타 막기 — 주소 화면으로 두 번 들어가 기록이 두 번 쌓이지 않게(전체 감사 A13) */
  const [leaving, setLeaving] = useState(false);
  const checkedRef = useRef(false);

  /**
   * 주소를 저장하고 이 화면으로 돌아오면 앱 화면 캐시(5분)가 예전 「주소 등록」 화면을 다시 그릴 수 있다 —
   * 그때는 서버 단계 판정이 다시 돌지 않으므로, 화면이 열릴 때 서버에 한 번 물어 이미 끝났으면 다음 화면으로(전체 감사 A2).
   */
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    void fetchSignupStatusDeduped(next, { inSession: true })
      .then(({ status, json }) => {
        const route = status === 200 ? json?.route?.trim() : "";
        if (!route) return;
        if ((route.split("?")[0] ?? route) === DIBAY_REGISTRATION_STEP_PATH.address) return;
        guardedRouterReplace(router, route, { source: "registration-address-step", reason: "address_done" });
      })
      .catch(() => {
        /* 서버 단계 판정은 다음 이동 때 다시 */
      });
  }, [next, router]);

  const onRegister = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    const back = registrationStepHref("address", next) ?? DIBAY_REGISTRATION_STEP_PATH.address;
    router.push(buildAddressEditHref(back));
  }, [leaving, next, router]);

  return (
    <RegistrationPageShell
      title={t("auth_reg_address_title")}
      description={t("auth_reg_address_intro")}
      titleId="dibay-registration-address-title"
      primaryAction={
        <button
          type="button"
          onClick={onRegister}
          disabled={leaving}
          className={`${MY_STICKY_CTA_PRIMARY_BUTTON_CLASS} sam-press`}
          data-testid="registration-address-start"
        >
          {t("auth_reg_address_cta")}
        </button>
      }
    />
  );
}
