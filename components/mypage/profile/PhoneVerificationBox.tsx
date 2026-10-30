"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  normalizePhilippinesPhoneNumber,
  isValidPhilippinesMobilePhone,
} from "@/lib/phone/philippines-phone";
import { PH_MOBILE_PLUS63_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { formatPhMobileDisplayPlus63, normalizePhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { PROFILE_EDIT_FIELD_INCOMPLETE_CLASS, PROFILE_EDIT_INPUT_CLASS, PROFILE_EDIT_PRIMARY_BTN_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";
import { isValidPhoneOtpCodeInput, PHONE_OTP_CODE_LENGTH } from "@/lib/auth/phone-otp-contract";
import { resolvePhoneOtpUiError } from "@/lib/auth/phone-otp-client-errors";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { resolveProfilePhoneDb09 } from "@/lib/profile/resolve-profile-phone";
import { resolveMemberPhoneState } from "@/lib/profile/member-account-status";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { Sam } from "@/lib/ui/sam-component-classes";

/** 재전송 남은 초 — 렌더 시점 계산이 아니라 1초마다 갱신되는 `now` 로 계산 (S05) */
export function resolvePhoneOtpCooldownLeft(cooldownUntil: number, now: number): number {
  return Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
}

type VerificationSettings = {
  enabled: boolean;
  provider?: "supabase" | "semaphore" | string;
  guide_text: string;
  resend_cooldown_seconds: number;
};

type VerifySnapshot = {
  phone: string | null;
  phone_country_code?: string | null;
  phone_number?: string | null;
  phone_verified: boolean;
  phone_verified_at?: string | null;
  phone_verification_method?: string | null;
  phone_verification_status?: string | null;
  member_status?: string | null;
  role?: string | null;
  privilegedAdmin?: boolean;
  email?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
  settings?: VerificationSettings;
};

function resolveSnapshotPhoneDb09(snapshot: VerifySnapshot): string | null {
  return resolveProfilePhoneDb09({
    phone: snapshot.phone,
    phone_country_code: snapshot.phone_country_code,
    phone_number: snapshot.phone_number,
  });
}

export function PhoneVerificationBox({
  snapshot,
  onRefreshProfile,
  compact = false,
  setupError = false,
  fieldIncomplete = false,
  verifyCtaPlacement = "inline",
  settingsLoadFailed = false,
  onRetrySettings,
}: {
  snapshot: VerifySnapshot;
  onRefreshProfile: () => Promise<void>;
  /** 프로필 수정 — 안내 문구·테두리 최소화 */
  compact?: boolean;
  setupError?: boolean;
  fieldIncomplete?: boolean;
  /** [인증 완료] 위치 — inline(시트·설정 폼) / sticky(필수정보 페이지 하단 고정, S05) */
  verifyCtaPlacement?: "inline" | "sticky";
  /** 설정 조회 실패 — 무한 로딩 대신 오류 + [다시 시도] (S05) */
  settingsLoadFailed?: boolean;
  onRetrySettings?: () => void;
}) {
  const { t } = useI18n();
  const [phone, setPhone] = useState(snapshot.phone ?? "");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [allowEdit, setAllowEdit] = useState(!snapshot.phone_verified);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const resolvedSnapshotPhone = useMemo(() => resolveSnapshotPhoneDb09(snapshot), [snapshot]);

  const verified = hasVerifiedPhone({
    role: snapshot.role ?? null,
    privilegedAdmin: snapshot.privilegedAdmin === true,
    phone_verified: snapshot.phone_verified === true,
    phone_verified_at: snapshot.phone_verified_at ?? null,
    phone_verification_method: snapshot.phone_verification_method ?? null,
    provider: snapshot.provider ?? snapshot.auth_provider ?? null,
    auth_provider: snapshot.auth_provider ?? snapshot.provider ?? null,
    email: snapshot.email ?? null,
  });

  useEffect(() => {
    setPhone(resolvedSnapshotPhone ?? "");
    setAllowEdit(!verified);
  }, [resolvedSnapshotPhone, verified]);

  const settings = snapshot.settings;
  const cooldownSec = Math.max(1, Number(settings?.resend_cooldown_seconds ?? 60));
  const cooldownLeft = resolvePhoneOtpCooldownLeft(cooldownUntil, nowMs);

  /** 재전송 타이머 — 쿨다운 동안 1초마다 다시 그린다 (S05: 남은 초가 줄지 않던 결함) */
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      const n = Date.now();
      setNowMs(n);
      if (n >= cooldownUntil) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);
  const normalizedPhone = useMemo(() => normalizePhilippinesPhoneNumber(phone), [phone]);
  const phoneForApi = useMemo(() => {
    const db = normalizePhMobileDb(phone);
    if (db) return db;
    const e164 = normalizedPhone;
    if (isValidPhilippinesMobilePhone(e164)) {
      return normalizePhMobileDb(parsePhMobileInput(e164)) ?? e164;
    }
    return e164;
  }, [phone, normalizedPhone]);
  const validPhone = isValidPhilippinesMobilePhone(normalizedPhone);

  const requestOtp = async () => {
    setError(null);
    setMessage(null);
    if (!validPhone) {
      setError(t("my_phone_rule_invalid"));
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/account/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phoneForApi }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        phone?: string;
      };
      if (!res.ok || !json.ok) {
        setError(
          resolvePhoneOtpUiError(
            { status: res.status, code: json.code, message: json.message },
            t,
            "send",
          ),
        );
        return;
      }
      setMessage(`${t("my_phone_sent_hint")} (${json.phone ?? normalizedPhone})`);
      setCooldownUntil(Date.now() + cooldownSec * 1000);
    } catch (e) {
      // 네트워크 예외 — 원문은 로그로만, 화면은 i18n 키 (P2-15).
      console.warn("[phone-otp] send threw", e instanceof Error ? e.name : "unknown");
      setError(t("my_phone_send_failed"));
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setMessage(null);
    if (!validPhone) {
      setError(t("my_phone_rule_invalid"));
      return;
    }
    if (!isValidPhoneOtpCodeInput(otp)) {
      setError(t("my_phone_code_required"));
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/account/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phoneForApi, otp: otp.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        setError(
          resolvePhoneOtpUiError(
            { status: res.status, code: json.code, message: json.message },
            t,
            "verify",
          ),
        );
        return;
      }
      setMessage(t("my_phone_verified_success"));
      setOtp("");
      setAllowEdit(false);
      await onRefreshProfile();
    } catch (e) {
      console.warn("[phone-otp] verify threw", e instanceof Error ? e.name : "unknown");
      setError(t("my_phone_verify_failed"));
    } finally {
      setVerifying(false);
    }
  };

  if (!settings) {
    if (settingsLoadFailed) {
      return (
        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
          role="alert"
          data-testid="phone-verify-settings-error"
        >
          <p className="sam-text-body font-semibold text-sam-fg">{t("my_phone_verify_title")}</p>
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("mypage_s05_load_failed")}</p>
          {onRetrySettings ? (
            <button
              type="button"
              onClick={onRetrySettings}
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} mt-2`}
            >
              {t("common_retry")}
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div
        className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
        aria-busy="true"
        data-testid="phone-verify-settings-loading"
      >
        <p className="sam-text-body font-semibold text-sam-fg">{t("my_phone_verify_title")}</p>
        <span className="mt-2 block h-3 w-[60%] rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
        <span className="mt-3 block h-[46px] w-full rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (!settings.enabled) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
        <p className="sam-text-body font-semibold text-sam-fg">{t("my_phone_verify_title")}</p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          {t("mypage_comp_phone_verify_disabled")}
        </p>
      </div>
    );
  }

  const showSetupShellError = setupError && !verified && !error;
  const setupShellClass = showSetupShellError ? "rounded-ui-rect border border-sam-danger bg-sam-danger-soft/40 p-3" : "";
  const shellClass = compact
    ? `space-y-3${setupShellClass ? ` ${setupShellClass}` : ""}`
    : `space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4${setupShellClass ? ` ${setupShellClass}` : ""}`;
  const showFieldIncomplete = fieldIncomplete && !verified;
  const inputClass = compact
    ? `${PROFILE_EDIT_INPUT_CLASS}${showFieldIncomplete ? ` ${PROFILE_EDIT_FIELD_INCOMPLETE_CLASS}` : ""}`
    : `sam-input${showFieldIncomplete ? ` ${PROFILE_EDIT_FIELD_INCOMPLETE_CLASS}` : ""}`;
  const verifyBtnClass = compact
    ? PROFILE_EDIT_PRIMARY_BTN_CLASS + " px-3 py-2 text-[13px]"
    : `${Sam.btn.primaryCombo} ${Sam.btn.sm} disabled:opacity-45`;
  const otpBtnClass = compact
    ? "rounded-ui-rect border border-sam-primary/25 px-3 py-2 text-[13px] font-semibold text-sam-primary disabled:opacity-50"
    : "rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body font-medium text-sam-fg disabled:opacity-50";

  /**
   * 인증 표시 — 홈 필수정보·계정 S03 과 같은 판정(`resolveMemberPhoneState`, real-screen-redesign §11-2).
   * 인증됨이면 번호가 없어도 「인증 완료」(인증 = 권한 계약). 번호 없음은 「번호 미등록」 + [번호 등록] 으로만 표시.
   */
  const phoneState = resolveMemberPhoneState(snapshot);
  const verifiedNoNumber = phoneState.kind === "verified" && !phoneState.masked;
  const verifiedDisplayPhone = phoneState.masked ?? t("mypage_req_value_phone_none");
  const stickyVerify = verifyCtaPlacement === "sticky";
  const otpReady = validPhone && isValidPhoneOtpCodeInput(otp);

  return (
    <div className={shellClass}>
      {compact ? (
        <p className="text-[13px] text-sam-muted">
          {verified
            ? t("my_phone_verified_success")
            : settings.guide_text || t("profile_edit_section_phone_desc")}
        </p>
      ) : (
        <div>
          <p className="sam-text-body font-semibold text-sam-fg">{t("my_phone_verify_title")}</p>
          <p className="mt-1 sam-text-body-secondary text-sam-muted">
            {settings.guide_text || t("my_phone_intro_required")}
          </p>
        </div>
      )}

      {verified && !allowEdit ? (
        <div
          className={
            compact
              ? "flex flex-wrap items-center justify-between gap-2 rounded-ui-rect bg-sam-pressed-surface px-3 py-2.5"
              : "rounded-ui-rect border border-sam-success/30 bg-sam-success-soft px-3 py-2"
          }
        >
          <div className="min-w-0" data-phone-state={phoneState.kind}>
            <p className={compact ? "text-[13px] font-bold text-sam-primary" : "sam-text-body font-semibold text-sam-success"}>
              {t("my_phone_status_verified")}
            </p>
            <p className={compact ? "text-[14px] text-sam-fg" : "sam-text-body-secondary tabular-nums text-sam-fg"}>
              {verifiedDisplayPhone}
            </p>
          </div>
          <button
            type="button"
            className={
              compact
                ? "shrink-0 text-[13px] font-semibold text-sam-primary underline"
                : `${Sam.btn.secondaryCombo} ${Sam.btn.sm} mt-2`
            }
            onClick={() => setAllowEdit(true)}
          >
            {verifiedNoNumber ? t("mypage_req_cta_register_number") : t("mypage_comp_phone_change_number")}
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              type="tel"
              inputMode="tel"
              value={formatPhMobileDisplayPlus63(parsePhMobileInput(phone)) || phone}
              onChange={(e) => setPhone(parsePhMobileInput(e.target.value))}
              placeholder={PH_MOBILE_PLUS63_PLACEHOLDER}
              className={inputClass}
            />
            <button
              type="button"
              disabled={sending || cooldownLeft > 0}
              onClick={() => void requestOtp()}
              className={otpBtnClass}
            >
              {sending ? t("my_phone_sending") : t("my_phone_send_otp")}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              name="one-time-code"
              maxLength={PHONE_OTP_CODE_LENGTH}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D+/g, ""))}
              placeholder={t("my_phone_verify_code_placeholder")}
              className={inputClass}
            />
            {stickyVerify ? null : (
              <button
                type="button"
                disabled={verifying}
                onClick={() => void verifyOtp()}
                className={verifyBtnClass}
              >
                {verifying ? t("my_phone_verifying") : t("my_phone_verify_submit")}
              </button>
            )}
            <button
              type="button"
              disabled={sending || cooldownLeft > 0}
              onClick={() => void requestOtp()}
              className={otpBtnClass}
            >
              {cooldownLeft > 0
                ? t("mypage_comp_phone_resend_in_seconds", { seconds: cooldownLeft })
                : t("mypage_comp_phone_resend")}
            </button>
          </div>
        </>
      )}

      {error ? <p className="text-[13px] text-sam-danger" role="alert">{error}</p> : null}
      {showSetupShellError ? (
        <p className="text-[12px] text-sam-danger" role="alert">
          {t("profile_setup_err_phone_required")}
        </p>
      ) : null}
      {message ? <p className="text-[13px] text-sam-primary">{message}</p> : null}
      {stickyVerify && allowEdit ? (
        <MyStickyCta
          dirty={otpReady}
          primary={{
            label: t("my_phone_verify_submit"),
            onPress: () => void verifyOtp(),
            loading: verifying,
          }}
        />
      ) : null}
    </div>
  );
}
