"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isValidPhilippinesMobilePhone,
  normalizePhilippinesPhoneNumber,
} from "@/lib/phone/philippines-phone";

type VerificationSettings = {
  enabled: boolean;
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
      setError("필리핀 휴대폰 번호 형식을 확인해 주세요. 예: 0917 123 4567");
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
        setError(json.message || "OTP 발송에 실패했습니다.");
        return;
      }
      setMessage(`인증번호를 발송했습니다. (${json.phone ?? normalizedPhone})`);
      setCooldownUntil(Date.now() + cooldownSec * 1000);
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setMessage(null);
    if (!validPhone) {
      setError("전화번호를 확인해 주세요.");
      return;
    }
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("OTP 6자리를 입력해 주세요.");
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
        setError(json.message || "OTP 검증에 실패했습니다.");
        return;
      }
      setMessage("전화번호 인증 완료. 정상회원으로 전환되었습니다.");
      setOtp("");
      setAllowEdit(false);
      await onRefreshProfile();
    } finally {
      setVerifying(false);
    }
  };

  if (!settings?.enabled) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
        <p className="sam-text-body font-semibold text-sam-fg">전화번호 인증</p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          전화 인증 기능이 현재 비활성화되어 있습니다.
        </p>
      </div>
    );
  }

  const verified = snapshot.phone_verified === true && snapshot.member_status === "active";

  return (
    <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4">
      <div>
        <p className="sam-text-body font-semibold text-sam-fg">전화번호 인증</p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          {settings.guide_text || "필리핀 휴대폰 번호만 인증 가능합니다."}
        </p>
      </div>

      {verified && !allowEdit ? (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="sam-text-body font-semibold text-emerald-800">전화번호 인증 완료</p>
          <p className="sam-text-body-secondary text-emerald-700">
            인증 번호: {snapshot.phone ?? "-"} / 회원상태: active
          </p>
          <button
            type="button"
            className="mt-2 rounded-ui-rect border border-emerald-300 bg-white px-3 py-1.5 sam-text-helper text-emerald-800"
            onClick={() => setAllowEdit(true)}
          >
            번호 변경
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
              {sending ? "발송 중…" : "인증번호 받기"}
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D+/g, ""))}
              placeholder="OTP 6자리"
              className="sam-input"
            />
            <button
              type="button"
              disabled={verifying}
              onClick={() => void verifyOtp()}
              className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50"
            >
              {verifying ? "검증 중…" : "인증 완료"}
            </button>
            <button
              type="button"
              disabled={sending || cooldownLeft > 0}
              onClick={() => void requestOtp()}
              className="rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body font-medium text-sam-fg disabled:opacity-50"
            >
              {cooldownLeft > 0 ? `재발송 ${cooldownLeft}s` : "재발송"}
            </button>
          </div>
        </>
      )}

      {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
      {message ? <p className="sam-text-body-secondary text-emerald-700">{message}</p> : null}
    </div>
  );
}
