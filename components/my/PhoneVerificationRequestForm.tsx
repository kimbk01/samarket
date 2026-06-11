"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  formatPhMobileDisplay,
  normalizePhMobileDb,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { isValidPhoneOtpCodeInput, PHONE_OTP_CODE_LENGTH } from "@/lib/auth/phone-otp-contract";
import { resolvePhoneOtpUiError } from "@/lib/auth/phone-otp-client-errors";
import { invalidateMandatoryAddressGateClientCache } from "@/lib/addresses/mandatory-address-gate-client";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";

type VerificationPayload = {
  phone: string | null;
  phone_verified: boolean;
  phone_verification_status: string;
  display_name: string;
  help_text?: string;
  /** OAuth·이메일 가입과 동일 이용 조건 충족(관리자 수동 정식 회원 포함) */
  full_member_access_ok?: boolean;
  store_member_status?: string;
  consent_required?: boolean;
};

export function PhoneVerificationRequestForm() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [status, setStatus] = useState<VerificationPayload | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await runSingleFlight("me:phone-verification:get", () =>
          fetch("/api/me/phone-verification", { credentials: "include" })
        );
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setError(data?.error || t("my_phone_load_status_failed"));
          return;
        }
        const verification = data.verification as VerificationPayload;
        setStatus(verification);
        setPhoneDigits(parsePhMobileInput(verification.phone ?? ""));
        setDisplayName(verification.display_name ?? "");
      } catch {
        if (!cancelled) setError(t("my_phone_load_status_failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));
    setMessage((prev) => (prev === null ? prev : null));
    const norm = normalizePhMobileDb(phoneDigits);
    if (!norm) {
      setError(t("my_phone_rule_invalid"));
      setSubmitting((prev) => (prev ? false : prev));
      return;
    }
    try {
      const res = await fetch("/api/me/phone-verification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ display_name: displayName, phone: norm }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        code?: string;
        verification?: VerificationPayload;
      } | null;
      if (!res.ok || !data?.ok) {
        setError(
          resolvePhoneOtpUiError(
            { status: res.status, code: data?.code, message: data?.error },
            t,
            "send",
          ),
        );
        return;
      }
      if (data.verification) {
        setStatus(data.verification);
      }
      setMessage(t("my_phone_sent_hint"));
    } catch {
      setError(t("my_phone_send_otp_failed"));
    } finally {
      setSubmitting((prev) => (prev ? false : prev));
    }
  };

  const verifyCode = async () => {
    const norm = normalizePhMobileDb(phoneDigits);
    if (!norm) {
      setError(t("my_phone_rule_invalid"));
      return;
    }
    if (!isValidPhoneOtpCodeInput(otpCode)) {
      setError(t("my_phone_code_required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/me/phone-verification/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ display_name: displayName, phone: norm, code: otpCode.trim() }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        code?: string;
        verification?: VerificationPayload;
      } | null;
      if (!res.ok || !data?.ok) {
        setError(
          resolvePhoneOtpUiError(
            { status: res.status, code: data?.code, message: data?.error },
            t,
            "verify",
          ),
        );
        return;
      }
      invalidateMeProfileDedupedCache();
      invalidateMandatoryAddressGateClientCache();
      setStatus(data.verification as VerificationPayload);
      setMessage(t("my_phone_verified_success"));
      setOtpCode("");
    } catch {
      setError(t("my_phone_verify_code_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-signature/5 px-4 py-3">
        <p className="text-[17px] font-bold leading-[1.35] text-sam-fg">{t("my_phone_verify_title")}</p>
        <p className="mt-1 sam-text-helper leading-relaxed text-sam-muted">
          {status?.full_member_access_ok && !status.phone_verified
            ? t("my_phone_intro_admin")
            : t("my_phone_intro_required")}
        </p>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-[0_1px_2px_rgba(31,36,48,0.05)]">
        <p className="sam-text-body-secondary text-sam-muted">{t("my_phone_verify_status")}</p>
        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">
          {status?.phone_verified
            ? t("my_phone_status_verified")
            : status?.full_member_access_ok
              ? t("my_phone_status_full_member")
              : status?.phone_verification_status === "pending"
                ? t("my_phone_status_pending")
                : t("my_phone_status_unverified")}
        </p>
        {status?.help_text ? (
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{status.help_text}</p>
        ) : null}
        {status?.consent_required ? (
          <p className="mt-1 sam-text-body-secondary text-amber-700">{t("my_phone_consent_required")}</p>
        ) : null}
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-[0_1px_2px_rgba(31,36,48,0.05)]">
        <div>
          <label className="block text-[13px] font-semibold text-sam-fg">{t("my_phone_verify_nickname")}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            required
            className="sam-input mt-1"
          />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-sam-fg">{t("my_phone_verify_phone")}</label>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={17}
            value={formatPhMobileDisplay(phoneDigits)}
            onChange={(e) => setPhoneDigits(parsePhMobileInput(e.target.value))}
            placeholder={PH_MOBILE_PLACEHOLDER}
            required
            className="sam-input mt-1"
          />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-sam-fg">{t("my_phone_verify_code")}</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={PHONE_OTP_CODE_LENGTH}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D+/g, ""))}
            placeholder={t("my_phone_verify_code_placeholder")}
            className="sam-input mt-1"
          />
        </div>
        {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
        {message ? <p className="sam-text-body-secondary text-green-700">{message}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="sam-btn-primary w-full disabled:opacity-50"
        >
          {submitting ? t("my_phone_sending") : t("my_phone_send_otp")}
        </button>
        <button
          type="button"
          disabled={submitting || status?.full_member_access_ok === true}
          onClick={() => void verifyCode()}
          className="w-full rounded-ui-rect border border-sam-border py-3 sam-text-body font-semibold text-sam-fg disabled:opacity-50"
        >
          {submitting ? t("my_phone_verifying") : t("my_phone_verify_submit")}
        </button>
      </form>

      <Link href="/mypage/account" className="block text-center sam-text-body-secondary text-signature underline">
        {t("my_phone_back_account")}
      </Link>
    </div>
  );
}
