"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 샘플 매장 — 홈 선반 카드에 붙는 「샘플 매장」 표시.
 * 카드 내용(메뉴·가격·ETA·배달비)은 실매장과 같게 두고, 업종·검색 목록 카드 배지(`resolveStoreListCardBadges` sample)와 같은 색·문구만 더한다.
 */
export function StoresHomeSampleCardTag() {
  const { t } = useI18n();
  return (
    <span
      data-stores-home-sample-tag="true"
      className="inline-flex w-fit rounded-[4px] bg-sam-warning-soft px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-sam-warning"
    >
      {t("store_sample_badge")}
    </span>
  );
}
