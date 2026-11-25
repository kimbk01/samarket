"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOnboardingOverlayShell } from "@/components/auth/DibayOnboardingOverlayShell";
import { RegistrationStepEscape } from "@/components/auth/RegistrationStepLater";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import type { ProfileRow } from "@/lib/profile/types";
import { refreshClientMemberAccountAfterMutation } from "@/lib/auth/sync-member-account-client";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";
import {
  buildPhoneVerifySnapshot,
  loadPhoneVerificationState,
  type PhoneVerificationSettings,
} from "@/lib/mypage/load-phone-verification-state";
import { DIBAY_ONBOARDING_ERROR_CLASS, DIBAY_ONBOARDING_NOTICE_CLASS } from "@/lib/ui/dibay-onboarding-styles";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { dibayConfirm } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";
import { forceClearCorruptSession } from "@/lib/auth/logout-client";
import { AUTH_GATE_DIALOG_Z_CLASS } from "@/components/auth/AuthGateOverlay";

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
  /** 중복으로 거절된 번호 — 빈 계정 정리 때 서버가 다시 확인한다 */
  const [duplicatePhone, setDuplicatePhone] = useState<string | null>(null);
  const duplicate = duplicatePhone !== null;
  const genRef = useRef(0);

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

  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  /** 실수로 만든 빈 계정 정리 (설계 2026-11-21 §5-6) — 지운 뒤 이 기기 로그인만 정리하고 로그인 화면으로 */
  const discardThisAccount = useCallback(async () => {
    if (discarding) return;
    const ok = await dibayConfirm({
      title: t("auth_reg_discard_confirm_title"),
      description: t("auth_reg_discard_confirm_desc"),
      confirmLabel: t("auth_reg_discard_confirm_ok"),
      confirmTone: "destructive",
      zIndexClass: AUTH_GATE_DIALOG_Z_CLASS,
    });
    if (!ok) return;
    setDiscarding(true);
    setDiscardError(null);
    try {
      const res = await fetch("/api/me/registration/discard-empty-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirm: true, phone: duplicatePhone ?? "" }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        await forceClearCorruptSession().catch(() => undefined);
        window.location.replace("/login");
        return;
      }
      setDiscardError(t(json?.error === "not_empty_account" ? "auth_reg_discard_not_empty" : "auth_reg_discard_failed"));
    } catch {
      setDiscardError(t("auth_reg_discard_failed"));
    } finally {
      setDiscarding(false);
    }
  }, [discarding, duplicatePhone, t]);

  return (
    <DibayOnboardingOverlayShell
      title={t("auth_reg_phone_title")}
      description={t("auth_reg_phone_intro")}
      titleId="dibay-registration-phone-title"
      descriptionId="dibay-registration-phone-desc"
    >
      {state.kind === "loading" ? (
        <div className="py-6" aria-busy="true">
          <span className="sr-only">{t("common_loading")}</span>
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
          onPhoneDuplicate={(phone) => setDuplicatePhone(phone)}
          onPhoneInputChange={() => {
            setDuplicatePhone(null);
            setDiscardError(null);
          }}
          surface="overlay"
        />
      )}
      {duplicate ? (
        <div className={`mt-3 ${DIBAY_ONBOARDING_NOTICE_CLASS}`} role="status" data-testid="registration-phone-duplicate">
          <p className="font-semibold">{t("auth_reg_phone_duplicate_title")}</p>
          <p className="mt-1">{t("auth_reg_phone_duplicate_guide")}</p>
          {discardError ? (
            <p className={`mt-2 ${DIBAY_ONBOARDING_ERROR_CLASS}`} role="alert">
              {discardError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void discardThisAccount()}
            disabled={discarding}
            className={`${OverlayUi.btn.secondary} mt-3 w-full`}
            data-testid="registration-discard-empty-account"
          >
            {t("auth_reg_discard_cta")}
          </button>
        </div>
      ) : null}
      <RegistrationStepEscape showHelp />
    </DibayOnboardingOverlayShell>
  );
}
