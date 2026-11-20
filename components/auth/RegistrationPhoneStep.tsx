"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOnboardingOverlayShell } from "@/components/auth/DibayOnboardingOverlayShell";
import { RegistrationStepEscape, RegistrationStepLaterButton } from "@/components/auth/RegistrationStepLater";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import type { ProfileRow } from "@/lib/profile/types";
import { refreshClientMemberAccountAfterMutation } from "@/lib/auth/sync-member-account-client";
import { deferProfileSetupForSession } from "@/lib/auth/profile-setup-defer.client";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";
import {
  buildPhoneVerifySnapshot,
  loadPhoneVerificationState,
  type PhoneVerificationSettings,
} from "@/lib/mypage/load-phone-verification-state";
import { DIBAY_ONBOARDING_ERROR_CLASS, DIBAY_ONBOARDING_NOTICE_CLASS } from "@/lib/ui/dibay-onboarding-styles";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; profile: ProfileRow; settings: PhoneVerificationSettings };

/**
 * 가입 단계 — 전화 인증. 인증 방법·API 는 내정보 전화 인증과 같다(`PhoneVerificationBox` 재사용, 변경 없음).
 * 완료 → signup-status `route`(다음 단계 = 주소, 또는 원래 화면).
 */
export function RegistrationPhoneStep({ next }: { next: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  /** 다른 계정이 쓰는 번호 — 원래 가입한 방법으로 로그인 후 로그인 연결 안내 (Owner 2026-11-20 「권장안대로 진행」) */
  const [duplicate, setDuplicate] = useState(false);
  const genRef = useRef(0);

  /** 이 화면을 본 것 = 로그인 세션당 1회 안내를 받은 것 — 이후 화면 이동마다 다시 보내지 않는다 */
  useEffect(() => {
    deferProfileSetupForSession();
  }, []);

  const load = useCallback(async () => {
    const gen = ++genRef.current;
    setState({ kind: "loading" });
    const result = await loadPhoneVerificationState();
    if (gen !== genRef.current) return;
    setState(result.ok ? { kind: "ready", profile: result.profile, settings: result.settings } : { kind: "error" });
  }, []);

  useEffect(() => {
    void load();
    return () => {
      genRef.current += 1;
    };
  }, [load]);

  const snapshot = useMemo(
    () => (state.kind === "ready" ? buildPhoneVerifySnapshot(state.profile, state.settings) : null),
    [state],
  );

  const handleRefresh = useCallback(async () => {
    await refreshClientMemberAccountAfterMutation();
  }, []);

  const goNextStep = useCallback(async () => {
    let target = next;
    try {
      const { status, json } = await fetchSignupStatusDeduped(next, { inSession: true });
      if (status === 200 && json?.route?.trim()) target = json.route.trim();
    } catch {
      /* 다음 단계 화면이 들어올 때 다시 판정한다 */
    }
    guardedRouterReplace(router, target, { source: "registration-phone-step", reason: "phone_verified" });
  }, [next, router]);

  const onLater = useCallback(() => {
    guardedRouterReplace(router, next, { source: "registration-phone-step", reason: "later" });
  }, [next, router]);

  return (
    <DibayOnboardingOverlayShell
      title={t("auth_reg_phone_title")}
      description={t("auth_reg_phone_intro")}
      titleId="dibay-registration-phone-title"
      descriptionId="dibay-registration-phone-desc"
      footer={<RegistrationStepLaterButton onLater={onLater} />}
    >
      {state.kind === "loading" ? (
        <div className="py-6" aria-busy="true">
          <span className="block h-12 w-full rounded-[length:var(--overlay-radius-sm)] bg-[color:var(--overlay-secondary)] motion-safe:animate-pulse" />
        </div>
      ) : state.kind === "error" || !snapshot ? (
        <div className="py-4">
          <p className={DIBAY_ONBOARDING_ERROR_CLASS} role="alert">
            {t("auth_reg_load_failed")}
          </p>
          <button type="button" onClick={() => void load()} className={`${OverlayUi.btn.secondary} mt-2`}>
            {t("common_retry")}
          </button>
        </div>
      ) : !state.settings.enabled ? (
        <p className="py-4 text-[length:var(--overlay-body-1-size)] leading-[1.6] text-[color:var(--overlay-text-secondary)]">
          {t("mypage_comp_phone_verify_disabled")}
        </p>
      ) : (
        <PhoneVerificationBox
          snapshot={snapshot}
          onRefreshProfile={handleRefresh}
          onDone={() => void goNextStep()}
          onPhoneDuplicate={() => setDuplicate(true)}
          surface="overlay"
        />
      )}
      {duplicate ? (
        <div className={`mt-3 ${DIBAY_ONBOARDING_NOTICE_CLASS}`} role="status" data-testid="registration-phone-duplicate">
          <p className="font-semibold">{t("auth_reg_phone_duplicate_title")}</p>
          <p className="mt-1">{t("auth_reg_phone_duplicate_guide")}</p>
        </div>
      ) : null}
      <RegistrationStepEscape showHelp />
    </DibayOnboardingOverlayShell>
  );
}
