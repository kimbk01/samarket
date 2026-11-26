"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { RegistrationPageShell } from "@/components/auth/RegistrationPageShell";
import { MY_STICKY_CTA_PRIMARY_BUTTON_CLASS } from "@/components/mypage/ds/MyStickyCta";
import { Sam } from "@/lib/ui/sam-component-classes";
import { RegistrationStepHelp } from "@/components/auth/RegistrationStepLater";
import { PhoneVerificationBox, type RegistrationPhoneStepKind } from "@/components/mypage/profile/PhoneVerificationBox";
import type { ProfileRow } from "@/lib/profile/types";
import { refreshClientMemberAccountAfterMutation } from "@/lib/auth/sync-member-account-client";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";
import {
  buildPhoneVerifySnapshot,
  loadPhoneVerificationState,
  type PhoneVerificationSettings,
} from "@/lib/mypage/load-phone-verification-state";
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
  /** 하단 고정 주 버튼 자리 — `PhoneVerificationBox` 가 단계별 버튼([계속]·[다시 보내기]·[확인])을 넣는다 */
  const [actionSlot, setActionSlot] = useState<HTMLDivElement | null>(null);
  const [regStep, setRegStep] = useState<RegistrationPhoneStepKind>("phone");
  const countryBackRef = useRef<(() => void) | null>(null);

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

  const titleText = t("auth_reg_phone_title");
  /** 맨 위 줄 · [가입 취소] 를 상자 단계에 맞춘다 (시안 v3 2-5 국가 선택 · 3-3 완료) */
  const onTopBack = regStep === "country" ? () => countryBackRef.current?.() : undefined;
  const showBody = state.kind === "ready" && snapshot && state.settings.enabled;

  return (
    <RegistrationPageShell
      topTitle={regStep === "country" ? t("my_phone_tg_country_title") : undefined}
      onTopBack={onTopBack}
      title={showBody ? undefined : titleText}
      description={showBody ? undefined : t("auth_reg_phone_intro")}
      titleId="dibay-registration-phone-title"
      exit={regStep === "done" ? null : "signup_cancel"}
      primarySlotRef={setActionSlot}
      primaryAction={
        state.kind === "error" ? (
          <button type="button" onClick={() => void load()} className={`${MY_STICKY_CTA_PRIMARY_BUTTON_CLASS} sam-press`}>
            {t("common_retry")}
          </button>
        ) : null
      }
    >
      {state.kind === "loading" ? (
        <div className="py-6" aria-busy="true" role="status" aria-label={t("common_loading")}>
          <span className="block h-14 w-full rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
        </div>
      ) : state.kind === "error" || !snapshot ? (
        <p className="mt-4 text-[12px] leading-[1.4] text-sam-danger" role="alert">
          {t("auth_reg_load_failed")}
        </p>
      ) : !state.settings.enabled ? (
        <p className="mt-4 text-[14px] leading-[1.6] text-sam-muted">{t("mypage_comp_phone_verify_disabled")}</p>
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
          registration={{
            title: titleText,
            /** 2-6 중복 번호 — 안내 상자 자리를 위해 설명 줄은 숨김(시안 v3) */
            description: duplicate ? undefined : t("auth_reg_phone_intro"),
            actionSlot,
            onStepChange: setRegStep,
            countryBackRef,
          }}
        />
      )}
      {duplicate && regStep === "phone" ? (
        <div
          className="mt-4 rounded-ui-rect border border-sam-primary-border bg-sam-primary-soft px-3.5 py-3 text-[14px] leading-[1.6] text-sam-fg"
          role="status"
          data-testid="registration-phone-duplicate"
        >
          <p className="font-bold">{t("auth_reg_phone_duplicate_title")}</p>
          <p className="[word-break:keep-all]">{t("auth_reg_phone_duplicate_guide")}</p>
          {discardError ? (
            <p className="mt-2 text-[12px] leading-[1.4] text-sam-danger" role="alert">
              {discardError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void discardThisAccount()}
            disabled={discarding}
            className={`${Sam.btn.secondaryCombo} ${Sam.btn.block} ${Sam.focusRing} sam-press mt-3`}
            data-testid="registration-discard-empty-account"
          >
            {t("auth_reg_discard_cta")}
          </button>
        </div>
      ) : null}
      {showBody && regStep === "phone" && !duplicate ? <RegistrationStepHelp /> : null}
    </RegistrationPageShell>
  );
}
