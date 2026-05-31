"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";
import Link from "next/link";

/**
 * 매장 상세 하단 — 매장 정보 진입만 (리뷰 미리보기는 카테고리 상단 `StoreMenuReviewFlowLink`).
 */
export function StoreDetailDeferredInfoSection({
  storeRootPath,
  reviewTopSlot,
}: {
  storeSlug: string;
  storeRootPath: string;
  /** @deprecated 레거시 호환 — summary fetch 제거 후 미사용 */
  legacyReviewCount?: number;
  reviewTopSlot?: ReactNode;
}) {
  const { t } = useI18n();
  const infoHref = `${storeRootPath}/info`;

  return (
    <>
      {reviewTopSlot ? <div className="mx-4 mt-4">{reviewTopSlot}</div> : null}
      <div className="mx-4 mt-4 border-t border-neutral-100 pt-4 pb-2 text-center">
        <Link
          href={infoHref}
          className="text-[12px] text-neutral-500 underline underline-offset-2"
        >
          {t("store_info_title")}
        </Link>
      </div>
    </>
  );
}
