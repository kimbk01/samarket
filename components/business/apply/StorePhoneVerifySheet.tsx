"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { PHONE_OTP_CODE_LENGTH, isValidPhoneOtpCodeInput } from "@/lib/auth/phone-otp-contract";
import { isValidPhilippinesMobilePhone, normalizePhilippinesPhoneNumber } from "@/lib/phone/philippines-phone";
import { formatPhMobileDisplayPlus63 } from "@/lib/utils/ph-mobile";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";
import { FORM_INTERACTIVE_PRESS_CLASS } from "@/lib/ui/form-keyboard-viewport-contract";
import { storePhoneVerifyErrorKey } from "@/lib/stores/store-application-errors";

export type StorePhoneVerified = {
  verificationId: string;
  /** DB 형식 `09…` */
  phone: string;
  verifiedAt: string;
};

/**
 * 매장 전화 전용 인증 시트 (Owner 2026-11-10 — 회원 전화 인증 DB 와 분리).
 * 회원 전화 인증과 같은 모양(텔레그램형): [국가번호 | 번호] 한 줄 → [계속] → 6칸(6번째에서 자동 확인) → 완료.
 * 매장 전화 저장 형식이 필리핀 휴대폰이라 국가는 🇵🇭 +63 고정(목록 없음).
 */
export function StorePhoneVerifySheet({
  open,
  onClose,
  purpose,
  storeId,
  initialPhone,
  onVerified,
}: {
  open: boolean;
  onClose: () => void;
  purpose: "store_apply" | "store_phone_change";
  storeId?: string | null;
  initialPhone?: string;
  onVerified: (v: StorePhoneVerified) => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [sentPhone, setSentPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const submittedRef = useRef("");
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("phone");
    setPhone(initialPhone ? formatPhMobileDisplayPlus63(initialPhone).replace(/^\+63\s*/, "") : "");
    setOtp("");
    setError(null);
    submittedRef.current = "";
  }, [open, initialPhone]);

  useEffect(() => {
    if (!open || cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, cooldownUntil]);

  /** 사용자가 친 그대로 두고(0 있든 없든·+63 붙여넣기) 보낼 때만 정규화 */
  const e164 = normalizePhilippinesPhoneNumber(phone);
  const phoneOk = isValidPhilippinesMobilePhone(e164);
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const press = (e: MouseEvent) =>
    triggerInteractionFeedback("light", { pointerType: (e.nativeEvent as PointerEvent).pointerType });

  const send = async () => {
    if (!phoneOk || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/me/store-phone-verification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: e164, purpose, storeId: storeId ?? null }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string; retryAfterSec?: number; resendAvailableAt?: string };
      if (!res.ok || !json.ok) {
        if (typeof json.retryAfterSec === "number") setCooldownUntil(Date.now() + json.retryAfterSec * 1000);
        setError(t(storePhoneVerifyErrorKey(json.code ?? json.error)));
        return;
      }
      setSentPhone(e164);
      setCooldownUntil(Date.parse(json.resendAvailableAt ?? "") || Date.now() + 60_000);
      setNow(Date.now());
      setOtp("");
      submittedRef.current = "";
      setStep("code");
    } catch {
      setError(t("common_network_error"));
    } finally {
      setSending(false);
    }
  };

  const verify = useCallback(
    async (code: string) => {
      if (!isValidPhoneOtpCodeInput(code)) return;
      setVerifying(true);
      setError(null);
      try {
        const res = await fetch("/api/me/store-phone-verification/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone: sentPhone, code, purpose }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          error?: string;
          verificationId?: string;
          phone?: string;
          verifiedAt?: string;
        };
        if (!res.ok || !json.ok || !json.verificationId || !json.phone) {
          setError(t(storePhoneVerifyErrorKey(json.code ?? json.error)));
          setOtp("");
          submittedRef.current = "";
          return;
        }
        onVerified({ verificationId: json.verificationId, phone: json.phone, verifiedAt: json.verifiedAt ?? "" });
        onClose();
      } catch {
        setError(t("common_network_error"));
        setOtp("");
        submittedRef.current = "";
      } finally {
        setVerifying(false);
      }
    },
    [sentPhone, purpose, onVerified, onClose, t]
  );

  useEffect(() => {
    if (step !== "code" || verifying || otp.length !== PHONE_OTP_CODE_LENGTH) return;
    if (submittedRef.current === otp) return;
    submittedRef.current = otp;
    void verify(otp);
  }, [otp, step, verifying, verify]);

  const pill = `flex h-[52px] w-full items-center justify-center rounded-full bg-sam-primary text-[17px] font-bold text-sam-on-primary disabled:bg-[color:var(--sam-primary-disabled)] disabled:text-sam-muted ${FORM_INTERACTIVE_PRESS_CLASS}`;
  const digits = Array.from({ length: PHONE_OTP_CODE_LENGTH }, (_, i) => otp[i] ?? "");

  return (
    <DibayBottomSheet open={open} onClose={onClose} title={t("store_apply_phone_sheet_title")}>
      <div className="px-4 pb-2" data-testid="store-phone-verify-sheet">
        {step === "phone" ? (
          <div className="flex flex-col">
            <p className="pb-4 text-[14px] leading-[1.5] text-sam-muted">{t("store_apply_phone_sheet_desc")}</p>
            <div className="border-t border-sam-border">
              <div className="flex h-14 items-center gap-3 border-b border-sam-border px-1">
                <span className="text-[22px]" aria-hidden>
                  🇵🇭
                </span>
                <span className="flex-1 text-[16px] font-semibold text-sam-fg">{t("store_apply_phone_country_ph")}</span>
              </div>
              <div className={`flex h-14 items-center border-b-2 ${error ? "border-sam-danger" : "border-sam-primary"}`}>
                <span className="w-14 pl-1 text-[18px] font-medium tabular-nums text-sam-fg">+63</span>
                <span className="mr-3 h-7 w-px bg-sam-border" aria-hidden />
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label={t("store_apply_phone_label")}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/[^\d+\s-]/g, "").slice(0, 16));
                    setError(null);
                  }}
                  placeholder="917 000 0000"
                  className="min-w-0 flex-1 bg-transparent text-[18px] tabular-nums text-sam-fg outline-none placeholder:text-sam-muted/70"
                  data-testid="store-phone-verify-number"
                />
              </div>
            </div>
            {error ? (
              <p className="mt-2 text-[13px] font-medium text-sam-danger" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!phoneOk || sending || cooldownLeft > 0}
              onClick={(e) => {
                press(e);
                void send();
              }}
              className={`${pill} mt-5`}
              data-testid="store-phone-verify-send"
            >
              {sending
                ? t("my_phone_sending")
                : cooldownLeft > 0
                  ? t("my_phone_tg_resend_in", { seconds: cooldownLeft })
                  : t("my_phone_tg_continue")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center" data-testid="store-phone-verify-code-step">
            <p className="text-[22px] font-bold tabular-nums text-sam-fg">{formatPhMobileDisplayPlus63(sentPhone)}</p>
            <p className="text-[14px] leading-[1.5] text-sam-muted">{t("my_phone_tg_code_desc")}</p>
            <button
              type="button"
              className={`min-h-[44px] px-3 text-[14px] font-semibold text-sam-primary ${FORM_INTERACTIVE_PRESS_CLASS}`}
              onClick={(e) => {
                press(e);
                setError(null);
                setOtp("");
                submittedRef.current = "";
                setStep("phone");
              }}
            >
              {t("my_phone_tg_change_number")}
            </button>
            <div className="relative mt-2 flex justify-center gap-2" onClick={() => codeRef.current?.focus()}>
              {digits.map((d, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={`flex h-14 w-11 items-center justify-center rounded-ui-rect border-[1.5px] text-[24px] font-semibold tabular-nums text-sam-fg ${
                    error ? "border-sam-danger" : d || i === Math.min(otp.length, PHONE_OTP_CODE_LENGTH - 1) ? "border-sam-primary" : "border-sam-border"
                  }`}
                >
                  {d}
                </span>
              ))}
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                name="one-time-code"
                aria-label={t("my_phone_tg_code_label")}
                maxLength={PHONE_OTP_CODE_LENGTH}
                value={otp}
                disabled={verifying}
                autoFocus
                onChange={(e) => {
                  setError(null);
                  setOtp(e.target.value.replace(/\D+/g, "").slice(0, PHONE_OTP_CODE_LENGTH));
                }}
                className="absolute inset-0 h-full w-full cursor-text opacity-0 caret-transparent"
                data-testid="store-phone-verify-code"
              />
            </div>
            {verifying ? <p className="text-[13px] text-sam-muted">{t("my_phone_verifying")}</p> : null}
            {error ? (
              <p className="text-[13px] font-medium text-sam-danger" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={sending || cooldownLeft > 0}
              onClick={(e) => {
                press(e);
                void send();
              }}
              className={`mt-2 min-h-[44px] px-3 text-[15px] font-semibold text-sam-primary disabled:font-normal disabled:text-sam-muted ${FORM_INTERACTIVE_PRESS_CLASS}`}
            >
              {sending
                ? t("my_phone_sending")
                : cooldownLeft > 0
                  ? t("my_phone_tg_resend_in", { seconds: cooldownLeft })
                  : t("my_phone_tg_resend")}
            </button>
          </div>
        )}
      </div>
    </DibayBottomSheet>
  );
}
