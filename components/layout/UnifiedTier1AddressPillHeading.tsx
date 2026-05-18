"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RepresentativeAddressLineState } from "@/hooks/use-representative-address-line";

const ADDRESS_MANAGEMENT_HREF = "/mypage/addresses";

/**
 * 거래/필라이프(`/philife`) 1단 공통 — 대표 주소 한 줄을 **알약 링크**로 표시.
 */
export function UnifiedTier1AddressPillHeading({ rep }: { rep: RepresentativeAddressLineState }) {
  const { t } = useI18n();
  if (rep.status === "loading") {
    return (
      <span className="sam-text-body-secondary truncate text-sam-muted">{t("layout_region_loading")}</span>
    );
  }
  const line = rep.line?.trim() || t("layout_region_default");
  const ariaLine = rep.line?.trim() || t("layout_region_fallback_short");
  return (
    <Link
      href={ADDRESS_MANAGEMENT_HREF}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-sam-primary-soft px-3 py-1.5 text-[length:calc(13px-2pt)] font-semibold text-sam-primary"
      aria-label={t("layout_address_manage_aria", { line: ariaLine })}
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
