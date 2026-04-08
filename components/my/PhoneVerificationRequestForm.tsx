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
    return <p className="py-8 text-center text-[14px] text-gray-500">불러오는 중…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#DBDBDB] bg-signature/5 px-4 py-3">
        <p className="text-sm font-semibold text-gray-900">필리핀 전화번호 인증</p>
        <p className="mt-1 text-[12px] leading-relaxed text-gray-600">
          전화번호 인증 전까지는 열람만 가능하며 글쓰기, 거래, 주문, 채팅은 사용할 수 없습니다. 현재 단계에서는
          인증 요청을 저장한 뒤 관리자가 승인합니다.
        </p>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-[13px] text-gray-500">현재 상태</p>
        <p className="mt-1 text-[16px] font-semibold text-gray-900">
          {status?.phone_verified
            ? "인증 완료"
            : status?.phone_verification_status === "pending"
              ? "승인 대기"
              : "미인증"}
        </p>
        <p className="mt-1 text-[13px] text-gray-600">{status?.help_text ?? ""}</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <label className="block text-[13px] font-medium text-gray-700">닉네임</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            required
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px]"
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-gray-700">필리핀 전화번호</label>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={17}
            value={formatPhMobileDisplay(phoneDigits)}
            onChange={(e) => setPhoneDigits(parsePhMobileInput(e.target.value))}
            placeholder={PH_MOBILE_PLACEHOLDER}
            required
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px]"
          />
        </div>
        {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
        {message ? <p className="text-[13px] text-green-700">{message}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-signature py-3 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "저장 중…" : "전화번호 인증 요청 저장"}
        </button>
      </form>

      <Link href="/mypage/account" className="block text-center text-[13px] text-signature underline">
        내 계정으로 돌아가기
      </Link>
    </div>
  );
}
