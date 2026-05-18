"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  isValidPhilippinesMobilePhone,
  normalizePhilippinesPhoneNumber,
} from "@/lib/phone/philippines-phone";

type VerificationSettings = {
  enabled: boolean;
  provider?: "supabase" | "semaphore" | string;
  guide_text: string;
  resend_cooldown_seconds: number;
};

type VerifySnapshot = {
  phone: string | null;
  phone_verified: boolean;
  member_status?: string | null;
  settings?: VerificationSettings;
};

export function PhoneVerificationBox({
  snapshot,
  onRefreshProfile,
}: {
  snapshot: VerifySnapshot;
  onRefreshProfile: () => Promise<void>;
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

  useEffect(() => {
    setPhone(snapshot.phone ?? "");
    setAllowEdit(!snapshot.phone_verified);
  }, [snapshot.phone, snapshot.phone_verified]);

  const settings = snapshot.settings;
  const cooldownSec = Math.max(1, Number(settings?.resend_cooldown_seconds ?? 60));
  const now = Date.now();
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const normalizedPhone = useMemo(() => normalizePhilippinesPhoneNumber(phone), [phone]);
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
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; phone?: string };
      if (!res.ok || !json.ok) {
        setError(json.message || t("my_phone_send_otp_failed"));
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
    if (!/^\d{6}$/.test(otp.trim())) {
      setError(t("my_phone_code_required"));
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/account/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: normalizedPhone, otp: otp.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setError(json.message || t("my_phone_verify_code_failed"));
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

  const verified = snapshot.phone_verified === true && snapshot.member_status === "active";

  return (
    <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4">
      <div>
        <p className="sam-text-body font-semibold text-sam-fg">{t("my_phone_verify_title")}</p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          {settings.guide_text || t("my_phone_intro_required")}
        </p>
      </div>

      {verified && !allowEdit ? (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="sam-text-body font-semibold text-emerald-800">{t("my_phone_status_verified")}</p>
          <p className="sam-text-body-secondary text-emerald-700">
            {t("mypage_comp_phone_verified_snapshot", {
              phone: snapshot.phone ?? "-",
            })}
          </p>
          <button
            type="button"
            className="mt-2 rounded-ui-rect border border-emerald-300 bg-white px-3 py-1.5 sam-text-helper text-emerald-800"
            onClick={() => setAllowEdit(true)}
          >
            {t("mypage_comp_phone_change_number")}
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0917 123 4567"
              className="sam-input"
            />
            <button
              type="button"
              disabled={sending || cooldownLeft > 0}
              onClick={() => void requestOtp()}
              className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body font-medium text-sam-fg disabled:opacity-50"
            >
              {sending ? t("my_phone_sending") : t("my_phone_send_otp")}
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D+/g, ""))}
              placeholder={t("my_phone_verify_code_placeholder")}
              className="sam-input"
            />
            <button
              type="button"
              disabled={verifying}
              onClick={() => void verifyOtp()}
              className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50"
            >
              {verifying ? t("my_phone_verifying") : t("my_phone_verify_submit")}
            </button>
            <button
              type="button"
              disabled={sending || cooldownLeft > 0}
              onClick={() => void requestOtp()}
              className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body font-medium text-sam-fg disabled:opacity-50"
            >
              {cooldownLeft > 0
                ? t("mypage_comp_phone_resend_in_seconds", { seconds: cooldownLeft })
                : t("mypage_comp_phone_resend")}
            </button>
          </div>
        </>
      )}

      {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
      {message ? <p className="sam-text-body-secondary text-emerald-700">{message}</p> : null}
    </div>
  );
}
