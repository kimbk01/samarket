"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RepresentativeAddressLineState } from "@/hooks/use-representative-address-line";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";

/**
 * 거래/필라이프(`/philife`) 1단 공통 — 대표 주소 한 줄을 **알약 링크**로 표시.
 */
export function UnifiedTier1AddressPillHeading({ rep }: { rep: RepresentativeAddressLineState }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const addressManagementHref = buildMypageAddressesHrefFromPath(
    pathname,
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  );
  if (rep.status === "loading") {
    return (
      <span className="sam-text-body-secondary truncate text-sam-muted">{t("layout_region_loading")}</span>
    );
  }
  const line = rep.line?.trim() || t("layout_region_default");
  const ariaLine = rep.line?.trim() || t("layout_region_fallback_short");
  return (
    <button
      type="button"
      onClick={() => router.push(addressManagementHref)}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-sam-primary-soft px-3 py-1.5 text-[length:calc(13px-2pt)] font-semibold text-sam-primary"
      aria-label={t("layout_address_manage_aria", { line: ariaLine })}
    >
      <AddressKindHeadPin kind="master" className="h-4 w-4 shrink-0 [&_svg]:h-4 [&_svg]:w-[0.85rem]" />
      <span className="min-w-0 truncate">{line}</span>
    </button>
  );
}
