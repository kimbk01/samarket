"use client";

import Link from "next/link";
import type { RepresentativeAddressLineState } from "@/hooks/use-representative-address-line";

const ADDRESS_MANAGEMENT_HREF = "/mypage/addresses";

/**
 * 거래/필라이프(`/philife`) 1단 공통 — 대표 주소 한 줄을 **알약 링크**로 표시.
 */
export function UnifiedTier1AddressPillHeading({ rep }: { rep: RepresentativeAddressLineState }) {
  if (rep.status === "loading") {
    return (
      <span className="sam-text-body-secondary truncate text-sam-muted">지역 불러오는 중…</span>
    );
  }
  const line = rep.line?.trim() || "내 지역 설정";
  return (
    <Link
      href={ADDRESS_MANAGEMENT_HREF}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-sam-primary-soft px-3 py-1.5 text-[length:calc(13px-2pt)] font-semibold text-sam-primary"
      aria-label={`주소 관리, 현재 ${rep.line?.trim() || "내 지역"}`}
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z"
        />
        <circle cx="12" cy="11" r="2.2" />
      </svg>
      <span className="min-w-0 truncate">{line}</span>
    </Link>
  );
}
