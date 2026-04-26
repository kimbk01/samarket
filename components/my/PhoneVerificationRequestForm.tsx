"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  formatPhMobileDisplay,
  normalizePhMobileDb,
  parsePhMobileInput,
  PH_LOCAL_MOBILE_RULE_MESSAGE_KO,
} from "@/lib/utils/ph-mobile";
import { PH_MOBILE_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type VerificationPayload = {
  phone: string | null;
  phone_verified: boolean;
  phone_verification_status: string;
  nickname: string;
  help_text?: string;
  /** OAuth·이메일 가입과 동일 이용 조건 충족(관리자 수동 정식 회원 포함) */
  full_member_access_ok?: boolean;
  store_member_status?: string;
  consent_required?: boolean;
};

export function PhoneVerificationRequestForm() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [nickname, setNickname] = useState("");
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
          setError(data?.error || "인증 상태를 불러오지 못했습니다.");
          return;
        }
        const verification = data.verification as VerificationPayload;
        setStatus(verification);
        setPhoneDigits(parsePhMobileInput(verification.phone ?? ""));
        setNickname(verification.nickname ?? "");
      } catch {
        if (!cancelled) setError("인증 상태를 불러오지 못했습니다.");
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
      setError(PH_LOCAL_MOBILE_RULE_MESSAGE_KO);
      setSubmitting((prev) => (prev ? false : prev));
      return;
    }
    try {
      const res = await fetch("/api/me/phone-verification/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nickname, phone: norm }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "인증 요청에 실패했습니다.");
        return;
      }
      setStatus(data.verification as VerificationPayload);
      setMessage("인증번호를 발송했습니다. 받은 코드를 입력해 정회원 인증을 완료해 주세요.");
    } catch {
      setError("인증번호 발송에 실패했습니다.");
    } finally {
      setSubmitting((prev) => (prev ? false : prev));
    }
  };

  const verifyCode = async () => {
    const norm = normalizePhMobileDb(phoneDigits);
    if (!norm) {
      setError(PH_LOCAL_MOBILE_RULE_MESSAGE_KO);
      return;
    }
    if (!otpCode.trim()) {
      setError("인증번호를 입력해 주세요.");
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
        body: JSON.stringify({ nickname, phone: norm, code: otpCode.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "인증번호 확인에 실패했습니다.");
        return;
      }
      setStatus(data.verification as VerificationPayload);
      setMessage("전화번호 인증이 완료되었습니다. 이제 정회원 기능을 이용할 수 있습니다.");
      setOtpCode("");
    } catch {
      setError("인증번호 확인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="py-8 text-center sam-text-body text-sam-muted">불러오는 중…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-signature/5 px-4 py-3">
        <p className="text-[17px] font-bold leading-[1.35] text-sam-fg">필리핀 전화번호 인증</p>
        <p className="mt-1 sam-text-helper leading-relaxed text-sam-muted">
          {status?.full_member_access_ok && !status.phone_verified ? (
            <>
              관리자 수동 생성 계정 또는 관리자 계정은 이미 정회원 권한으로 이용할 수 있습니다. 필요하면 필리핀 번호를
              등록해 업데이트할 수 있습니다.
            </>
          ) : (
            <>
              정회원 인증이 필요합니다. 필리핀 전화번호 인증 후 이용할 수 있습니다.
            </>
          )}
        </p>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-[0_1px_2px_rgba(31,36,48,0.05)]">
        <p className="sam-text-body-secondary text-sam-muted">현재 상태</p>
        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">
          {status?.phone_verified
            ? "인증 완료"
            : status?.full_member_access_ok
              ? "정식 회원(앱 이용 가능)"
              : status?.phone_verification_status === "pending"
                ? "인증번호 확인 대기"
                : "미인증"}
        </p>
        {status?.help_text ? (
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{status.help_text}</p>
        ) : null}
        {status?.consent_required ? (
          <p className="mt-1 sam-text-body-secondary text-amber-700">
            이용약관/개인정보처리방침 동의가 먼저 필요합니다.
          </p>
        ) : null}
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-[0_1px_2px_rgba(31,36,48,0.05)]">
        <div>
          <label className="block text-[13px] font-semibold text-sam-fg">닉네임</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            required
            className="sam-input mt-1"
          />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-sam-fg">필리핀 전화번호</label>
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
          <label className="block text-[13px] font-semibold text-sam-fg">인증번호</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D+/g, ""))}
            placeholder="SMS로 받은 인증번호"
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
          {submitting ? "발송 중…" : "인증번호 발송"}
        </button>
        <button
          type="button"
          disabled={submitting || status?.full_member_access_ok === true}
          onClick={() => void verifyCode()}
          className="w-full rounded-ui-rect border border-sam-border py-3 sam-text-body font-semibold text-sam-fg disabled:opacity-50"
        >
          {submitting ? "확인 중…" : "인증번호 확인"}
        </button>
      </form>

      <Link href="/mypage/account" className="block text-center sam-text-body-secondary text-signature underline">
        내 계정으로 돌아가기
      </Link>
    </div>
  );
}
