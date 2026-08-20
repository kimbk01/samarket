"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresOwnerStackHeader } from "@/components/business/owner/StoresOwnerStackHeader";

/**
 * `/stores/owner/apply` — 오너 스택 헤더 (`StoresOwnerStackHeader`).
 * 배달 `StoresGreenFixedHeaderChrome`(검색·알림) 사용 금지 — 입점은 오너 온보딩.
 */
export function StoresOwnerApplyHeaderChrome() {
  const { t } = useI18n();

  return (
    <StoresOwnerStackHeader
      variant="admin"
      backHref="/mypage"
      backPreferHistory
      backAriaLabel={t("business_phase7_675")}
      shopName={t("business_phase7_674")}
      pageTitle={t("business_phase7_674")}
      rightSlot={<div className="h-10 w-10 shrink-0" aria-hidden />}
    />
  );
}

/** 오너 스택 헤더 `h-14` + safe-top + 첫 섹션 여백 — `BusinessAdminShell` hub 본문과 동일 */
export const STORES_OWNER_APPLY_HEADER_BODY_OFFSET_CLASS =
  "pt-[calc(var(--safe-top)+3.5rem+0.75rem)]";
