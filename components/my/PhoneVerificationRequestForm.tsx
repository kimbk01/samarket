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

type VerificationPayload = {
  phone: string | null;
  phone_verified: boolean;
  phone_verification_status: string;
  nickname: string;
  help_text?: string;
  /** OAuth·이메일 가입과 동일 이용 조건 충족(관리자 수동 정식 회원 포함) */
  full_member_access_ok?: boolean;
};

export function PhoneVerificationRequestForm() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [nickname, setNickname] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [status, setStatus] = useState<VerificationPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/phone-verification", { credentials: "include" });
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
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const norm = normalizePhMobileDb(phoneDigits);
    if (!norm) {
      setError(PH_LOCAL_MOBILE_RULE_MESSAGE_KO);
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/me/phone-verification", {
        method: "PATCH",
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
      setMessage("전화번호 인증 요청을 저장했습니다. 관리자 승인 후 글쓰기, 거래, 주문, 채팅이 열립니다.");
    } catch {
      setError("인증 요청에 실패했습니다.");
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
        <p className="text-sm font-semibold text-sam-fg">필리핀 전화번호 인증</p>
        <p className="mt-1 sam-text-helper leading-relaxed text-sam-muted">
          {status?.full_member_access_ok && !status.phone_verified ? (
            <>
              Google·카카오·애플·이메일 가입 회원과 동일한 정식 회원으로 등록되어 있어 글쓰기·거래·주문·채팅을 이용할
              수 있습니다. 필리핀 번호는 선택적으로 등록·변경할 수 있으며, 요청 시 관리자 승인 절차가 적용됩니다.
            </>
          ) : (
            <>
              전화번호 인증 전까지는 열람만 가능하며 글쓰기, 거래, 주문, 채팅은 사용할 수 없습니다. 현재 단계에서는
              인증 요청을 저장한 뒤 관리자가 승인합니다.
            </>
          )}
        </p>
      </div>

      <div className="rounded-ui-rect bg-sam-surface p-4 shadow-sm">
        <p className="sam-text-body-secondary text-sam-muted">현재 상태</p>
        <p className="mt-1 sam-text-body-lg font-semibold text-sam-fg">
          {status?.phone_verified
            ? "인증 완료"
            : status?.full_member_access_ok
              ? "정식 회원(앱 이용 가능)"
              : status?.phone_verification_status === "pending"
                ? "승인 대기"
                : "미인증"}
        </p>
        {status?.help_text ? (
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{status.help_text}</p>
        ) : null}
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-ui-rect bg-sam-surface p-4 shadow-sm">
        <div>
          <label className="block sam-text-body-secondary font-medium text-sam-fg">닉네임</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            required
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        <div>
          <label className="block sam-text-body-secondary font-medium text-sam-fg">필리핀 전화번호</label>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={17}
            value={formatPhMobileDisplay(phoneDigits)}
            onChange={(e) => setPhoneDigits(parsePhMobileInput(e.target.value))}
            placeholder={PH_MOBILE_PLACEHOLDER}
            required
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
        {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
        {message ? <p className="sam-text-body-secondary text-green-700">{message}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-ui-rect bg-signature py-3 sam-text-body font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "저장 중…" : "전화번호 인증 요청 저장"}
        </button>
      </form>

      <Link href="/mypage/account" className="block text-center sam-text-body-secondary text-signature underline">
        내 계정으로 돌아가기
      </Link>
    </div>
  );
}
