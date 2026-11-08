"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  normalizePhilippinesPhoneNumber,
  isValidPhilippinesMobilePhone,
} from "@/lib/phone/philippines-phone";
import { phoneVerifyCountryOptionsFor } from "@/lib/phone/phone-country-codes";
import { formatKoreaMobileLocal, parseKoreaMobileLocal, parseKoreaMobileTyping } from "@/lib/phone/verify-phone-number";
import { formatPhMobileDisplayPlus63, normalizePhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { PROFILE_EDIT_FIELD_INCOMPLETE_CLASS, PROFILE_EDIT_INPUT_CLASS, PROFILE_EDIT_PRIMARY_BTN_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";
import { isValidPhoneOtpCodeInput, PHONE_OTP_CODE_LENGTH } from "@/lib/auth/phone-otp-contract";
import { resolvePhoneOtpUiError } from "@/lib/auth/phone-otp-client-errors";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { resolveProfilePhoneDb09 } from "@/lib/profile/resolve-profile-phone";
import { resolveMemberPhoneState } from "@/lib/profile/member-account-status";
import { MyStickyCta } from "@/components/mypage/ds/MyStickyCta";
import { Sam } from "@/lib/ui/sam-component-classes";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/** 재전송 남은 초 — 렌더 시점 계산이 아니라 1초마다 갱신되는 `now` 로 계산 (S05) */
export function resolvePhoneOtpCooldownLeft(cooldownUntil: number, now: number): number {
  return Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
}

type VerificationSettings = {
  enabled: boolean;
  provider?: "supabase" | "semaphore" | string;
  guide_text: string;
  resend_cooldown_seconds: number;
  /** 인증 가능한 국가번호 (`+63`·`+82`) — 없으면 +63 만 */
  country_dial_codes?: string[];
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
  surface = "page",
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
  /**
   * page(기본) = 앱 화면 모양 · overlay = 시트 안(`PhoneVerificationSheet`) — 팝업 SSOT 버튼·글자·색 (팝업 SSOT T3).
   * compact(프로필 수정 폼)는 페이지 전용이라 overlay 분기를 타지 않는다. 동작은 같다 — 클래스만 다르다.
   */
  surface?: "page" | "overlay";
}) {
  const { t, language } = useI18n();
  const ov = surface === "overlay" && !compact;
  const ovCls = {
    card: `rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 py-3`,
    title: `text-[length:var(--overlay-body-1-size)] font-semibold leading-[1.4] text-[color:var(--overlay-text-primary)]`,
    desc: `mt-1 text-[length:var(--overlay-body-2-size)] leading-[1.6] text-[color:var(--overlay-text-secondary)]`,
    skeleton: "rounded-[length:var(--overlay-radius-sm)] bg-[color:var(--overlay-secondary)]",
  };
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

  const settings = snapshot.settings;
  /** 국가번호 칸 — +63 필리핀(Semaphore) · +82 한국(Solapi, 서버가 허용할 때만) (Owner 2026-11-09). */
  const countryOptions = useMemo(
    () => phoneVerifyCountryOptionsFor(settings?.country_dial_codes),
    [settings?.country_dial_codes],
  );
  const snapshotIsKorea =
    String(snapshot.phone ?? "").startsWith("+82") || String(snapshot.phone_country_code ?? "") === "+82";
  const [dialCode, setDialCode] = useState<string>(snapshotIsKorea ? "+82" : "+63");
  const isKorea = dialCode === "+82";

  useEffect(() => {
    if (snapshotIsKorea) {
      setDialCode("+82");
      setPhone(parseKoreaMobileTyping(String(snapshot.phone ?? "")));
    } else {
      setPhone(resolvedSnapshotPhone ?? "");
    }
    setAllowEdit(!verified);
  }, [resolvedSnapshotPhone, verified, snapshotIsKorea, snapshot.phone]);

  /** 서버가 내준 목록에 없는 국가번호가 선택돼 있으면 첫 항목으로 되돌린다. */
  useEffect(() => {
    if (!countryOptions.some((c) => c.dialCode === dialCode)) {
      setDialCode(countryOptions[0]?.dialCode ?? "+63");
      setPhone("");
    }
  }, [countryOptions, dialCode]);

  const countryNoticeNames = countryOptions
    .map((c) => `${language === "en" ? c.labelEn : c.labelKo}(${c.dialCode})`)
    .join(language === "en" ? ", " : "·");
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
  const koreaLocal = isKorea ? parseKoreaMobileLocal(phone) : null;
  const phoneForApi = useMemo(() => {
    if (isKorea) return koreaLocal ? `+82${koreaLocal.slice(1)}` : "";
    const db = normalizePhMobileDb(phone);
    if (db) return db;
    const e164 = normalizedPhone;
    if (isValidPhilippinesMobilePhone(e164)) {
      return normalizePhMobileDb(parsePhMobileInput(e164)) ?? e164;
    }
    return e164;
  }, [phone, normalizedPhone, isKorea, koreaLocal]);
  const validPhone = isKorea ? koreaLocal != null : isValidPhilippinesMobilePhone(normalizedPhone);
  const invalidPhoneMessage = () => (isKorea ? t("my_phone_rule_invalid_kr") : t("my_phone_rule_invalid"));

  const requestOtp = async () => {
    setError(null);
    setMessage(null);
    if (!validPhone) {
      setError(invalidPhoneMessage());
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
      setError(invalidPhoneMessage());
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
          className={ov ? ovCls.card : "rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"}
          role="alert"
          data-testid="phone-verify-settings-error"
        >
          <p className={ov ? ovCls.title : "sam-text-body font-semibold text-sam-fg"}>{t("my_phone_verify_title")}</p>
          <p className={ov ? ovCls.desc : "mt-1 sam-text-body-secondary text-sam-muted"}>{t("mypage_s05_load_failed")}</p>
          {onRetrySettings ? (
            <button
              type="button"
              onClick={onRetrySettings}
              className={ov ? `${OverlayUi.btn.secondary} mt-2` : `${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} mt-2`}
            >
              {t("common_retry")}
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div
        className={ov ? ovCls.card : "rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"}
        aria-busy="true"
        data-testid="phone-verify-settings-loading"
      >
        <p className={ov ? ovCls.title : "sam-text-body font-semibold text-sam-fg"}>{t("my_phone_verify_title")}</p>
        <span
          className={`mt-2 block h-3 w-[60%] motion-safe:animate-pulse ${ov ? ovCls.skeleton : "rounded-ui-rect bg-sam-border-soft/70"}`}
        />
        <span
          className={`mt-3 block w-full motion-safe:animate-pulse ${ov ? `h-12 ${ovCls.skeleton}` : "h-[46px] rounded-ui-rect bg-sam-border-soft/70"}`}
        />
      </div>
    );
  }

  if (!settings.enabled) {
    return (
      <div className={ov ? ovCls.card : "rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"}>
        <p className={ov ? ovCls.title : "sam-text-body font-semibold text-sam-fg"}>{t("my_phone_verify_title")}</p>
        <p className={ov ? ovCls.desc : "mt-1 sam-text-body-secondary text-sam-muted"}>
          {t("mypage_comp_phone_verify_disabled")}
        </p>
      </div>
    );
  }

  const showSetupShellError = setupError && !verified && !error;
  const setupShellClass = showSetupShellError
    ? ov
      ? "rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-danger)] bg-[color:color-mix(in_srgb,var(--overlay-danger)_8%,#fff)] p-3"
      : "rounded-ui-rect border border-sam-danger bg-sam-danger-soft/40 p-3"
    : "";
  const shellClass = compact
    ? `space-y-3${setupShellClass ? ` ${setupShellClass}` : ""}`
    : ov
      ? `space-y-3 rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 py-4${setupShellClass ? ` ${setupShellClass}` : ""}`
      : `space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4${setupShellClass ? ` ${setupShellClass}` : ""}`;
  const showFieldIncomplete = fieldIncomplete && !verified;
  const inputClass = compact
    ? `${PROFILE_EDIT_INPUT_CLASS}${showFieldIncomplete ? ` ${PROFILE_EDIT_FIELD_INCOMPLETE_CLASS}` : ""}`
    : `${ov ? `${OverlayUi.input} !mt-0` : "sam-input"}${showFieldIncomplete ? ` ${PROFILE_EDIT_FIELD_INCOMPLETE_CLASS}` : ""}`;
  const verifyBtnClass = compact
    ? PROFILE_EDIT_PRIMARY_BTN_CLASS + " px-3 py-2 text-[13px]"
    : ov
      ? OverlayUi.btn.primary
      : `${Sam.btn.primaryCombo} ${Sam.btn.sm} disabled:opacity-45`;
  const otpBtnClass = compact
    ? "rounded-ui-rect border border-sam-primary/25 px-3 py-2 text-[13px] font-semibold text-sam-primary disabled:opacity-50"
    : ov
      ? OverlayUi.btn.secondary
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
          <p className={ov ? ovCls.title : "sam-text-body font-semibold text-sam-fg"}>{t("my_phone_verify_title")}</p>
          <p className={ov ? ovCls.desc : "mt-1 sam-text-body-secondary text-sam-muted"}>
            {settings.guide_text || t("my_phone_intro_required")}
          </p>
        </div>
      )}

      {verified && !allowEdit ? (
        <div
          className={
            compact
              ? "flex flex-wrap items-center justify-between gap-2 rounded-ui-rect bg-sam-pressed-surface px-3 py-2.5"
              : ov
                ? "rounded-[length:var(--overlay-radius-md)] bg-[color:var(--sm-color-primary-soft)] px-3 py-2"
                : "rounded-ui-rect border border-sam-success/30 bg-sam-success-soft px-3 py-2"
          }
        >
          <div className="min-w-0" data-phone-state={phoneState.kind}>
            <p
              className={
                compact
                  ? "text-[13px] font-bold text-sam-primary"
                  : ov
                    ? `text-[length:var(--overlay-body-1-size)] font-semibold leading-[1.4] text-[color:var(--overlay-primary)]`
                    : "sam-text-body font-semibold text-sam-success"
              }
            >
              {t("my_phone_status_verified")}
            </p>
            <p
              className={
                compact
                  ? "text-[14px] text-sam-fg"
                  : ov
                    ? `text-[length:var(--overlay-body-2-size)] leading-[1.6] tabular-nums text-[color:var(--overlay-text-primary)]`
                    : "sam-text-body-secondary tabular-nums text-sam-fg"
              }
            >
              {verifiedDisplayPhone}
            </p>
          </div>
          <button
            type="button"
            className={
              compact
                ? "shrink-0 text-[13px] font-semibold text-sam-primary underline"
                : ov
                  ? `${OverlayUi.btn.secondary} mt-2`
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
            {/* 국가번호 칸 + 번호 칸 분리 (Owner 2026-11-09). autoComplete 로 기기 저장 번호 제안 → 그대로 고칠 수 있음. */}
            <div className="grid min-w-0 grid-cols-[auto_1fr] gap-2">
              <select
                value={dialCode}
                onChange={(e) => {
                  setDialCode(e.target.value);
                  setPhone("");
                  setError(null);
                }}
                aria-label={t("my_phone_country_code_label")}
                autoComplete="tel-country-code"
                className={`${inputClass} !w-auto`}
                data-testid="phone-verify-country-code"
              >
                {countryOptions.map((c) => (
                  <option key={c.iso} value={c.dialCode}>
                    {`${c.flag} ${c.dialCode}`}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                name="tel"
                aria-label={t("my_phone_number_label")}
                value={isKorea ? formatKoreaMobileLocal(phone) : formatPhNationalDisplay(phone)}
                onChange={(e) =>
                  setPhone(isKorea ? parseKoreaMobileTyping(e.target.value) : parsePhMobileInput(e.target.value))
                }
                placeholder={t("my_phone_number_placeholder")}
                className={`${inputClass} min-w-0`}
                data-testid="phone-verify-number"
              />
            </div>
            <button
              type="button"
              disabled={sending || cooldownLeft > 0}
              onClick={() => void requestOtp()}
              className={otpBtnClass}
            >
              {sending ? t("my_phone_sending") : t("my_phone_send_otp")}
            </button>
          </div>
          <p className="sam-text-helper text-sam-muted" data-testid="phone-verify-country-notice">
            {t("my_phone_country_only_notice", { countries: countryNoticeNames })}
          </p>
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

      {error ? (
        <p className={ov ? `text-[length:var(--overlay-body-2-size)] leading-[1.6] text-[color:var(--overlay-danger)]` : "text-[13px] text-sam-danger"} role="alert">
          {error}
        </p>
      ) : null}
      {showSetupShellError ? (
        <p className={ov ? OverlayUi.captionDanger : "text-[12px] text-sam-danger"} role="alert">
          {t("profile_setup_err_phone_required")}
        </p>
      ) : null}
      {message ? (
        <p className={ov ? `text-[length:var(--overlay-body-2-size)] leading-[1.6] text-[color:var(--overlay-primary)]` : "text-[13px] text-sam-primary"}>{message}</p>
      ) : null}
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

/** 번호 칸 표시 — 국가번호는 옆 칸에 있으므로 `+63` 없이 `917 123 4567` (저장 상태는 그대로 `09…`). */
function formatPhNationalDisplay(phone: string): string {
  const d = parsePhMobileInput(phone);
  if (!d || d === "0") return d;
  return formatPhMobileDisplayPlus63(d).replace(/^\+63\s?/, "");
}
