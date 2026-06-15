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
import { hasPhilippinePhoneVerification } from "@/lib/auth/store-member-policy";
import { resolveProfilePhoneDb09 } from "@/lib/profile/resolve-profile-phone";

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
  member_status?: string | null;
  role?: string | null;
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
}: {
  snapshot: VerifySnapshot;
  onRefreshProfile: () => Promise<void>;
  /** 프로필 수정 — 안내 문구·테두리 최소화 */
  compact?: boolean;
  setupError?: boolean;
  fieldIncomplete?: boolean;
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

  const resolvedSnapshotPhone = useMemo(() => resolveSnapshotPhoneDb09(snapshot), [snapshot]);

  const verified = hasPhilippinePhoneVerification({
    role: snapshot.role ?? null,
    phone_verified: snapshot.phone_verified === true,
    phone_verified_at: snapshot.phone_verified_at ?? null,
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
  const now = Date.now();
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
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
    } finally {
      setVerifying(false);
    }
  };

  if (!settings) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
        <p className="sam-text-body font-semibold text-sam-fg">{t("my_phone_verify_title")}</p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("mypage_comp_loading_short")}</p>
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
  const setupShellClass = showSetupShellError ? "rounded-ui-rect border border-red-300 bg-red-50/40 p-3" : "";
  const shellClass = compact
    ? `space-y-3${setupShellClass ? ` ${setupShellClass}` : ""}`
    : `space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4${setupShellClass ? ` ${setupShellClass}` : ""}`;
  const showFieldIncomplete = fieldIncomplete && !verified;
  const inputClass = compact
    ? `${PROFILE_EDIT_INPUT_CLASS}${showFieldIncomplete ? ` ${PROFILE_EDIT_FIELD_INCOMPLETE_CLASS}` : ""}`
    : `sam-input${showFieldIncomplete ? ` ${PROFILE_EDIT_FIELD_INCOMPLETE_CLASS}` : ""}`;
  const verifyBtnClass = compact
    ? PROFILE_EDIT_PRIMARY_BTN_CLASS + " px-3 py-2 text-[13px]"
    : "rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50";
  const otpBtnClass = compact
    ? "rounded-ui-rect border border-[#00704A]/25 px-3 py-2 text-[13px] font-semibold text-[#00704A] disabled:opacity-50"
    : "rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body font-medium text-sam-fg disabled:opacity-50";

  const verifiedDisplayPhone =
    formatPhMobileDisplayPlus63(resolvedSnapshotPhone ?? "") ||
    formatPhMobileDisplayPlus63(snapshot.phone ?? "") ||
    snapshot.phone ||
    "—";

  return (
    <div className={shellClass}>
      {!compact ? (
        <div>
          <p className="sam-text-body font-semibold text-sam-fg">{t("my_phone_verify_title")}</p>
          <p className="mt-1 sam-text-body-secondary text-sam-muted">
            {settings.guide_text || t("my_phone_intro_required")}
          </p>
        </div>
      ) : null}

      {verified && !allowEdit ? (
        <div
          className={
            compact
              ? "flex flex-wrap items-center justify-between gap-2 rounded-ui-rect bg-[#E8F3EE] px-3 py-2.5"
              : "rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2"
          }
        >
          <div className="min-w-0">
            <p className={compact ? "text-[13px] font-bold text-[#00704A]" : "sam-text-body font-semibold text-emerald-800"}>
              {t("my_phone_status_verified")}
            </p>
            <p className={compact ? "text-[14px] text-[#1E3932]" : "sam-text-body-secondary text-emerald-700"}>
              {verifiedDisplayPhone}
            </p>
          </div>
          <button
            type="button"
            className={
              compact
                ? "shrink-0 text-[13px] font-semibold text-[#00704A] underline"
                : "mt-2 rounded-ui-rect border border-emerald-300 bg-white px-3 py-1.5 sam-text-helper text-emerald-800"
            }
            onClick={() => setAllowEdit(true)}
          >
            {t("mypage_comp_phone_change_number")}
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
              maxLength={PHONE_OTP_CODE_LENGTH}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D+/g, ""))}
              placeholder={t("my_phone_verify_code_placeholder")}
              className={inputClass}
            />
            <button
              type="button"
              disabled={verifying}
              onClick={() => void verifyOtp()}
              className={verifyBtnClass}
            >
              {verifying ? t("my_phone_verifying") : t("my_phone_verify_submit")}
            </button>
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

      {error ? <p className="text-[13px] text-red-600" role="alert">{error}</p> : null}
      {showSetupShellError ? (
        <p className="text-[12px] text-red-600" role="alert">
          {t("profile_setup_err_phone_required")}
        </p>
      ) : null}
      {message ? <p className="text-[13px] text-[#00704A]">{message}</p> : null}
    </div>
  );
}
