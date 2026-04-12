"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  listBrowsePrimaryIndustries,
  listBrowseSubIndustries,
} from "@/lib/stores/browse-mock/queries";
import { useBrowseIndustryDatasetVersion } from "@/lib/stores/browse-mock/use-browse-industry-dataset-version";
import { storesBrowsePath, storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";
import { FB } from "@/components/stores/store-facebook-feed-tokens";

/**
 * 매장 홈 — 배달 플랫폼형: 대분류 탭(한 줄) + 선택 업종의 세부만 그리드로 노출.
 * 긴 세로 반복 카드·이중 칩 스크롤 제거로 모바일 스크롤 부담 감소.
 * 앵커: `store-industry-explore`
 */
export function StoreCategoryExploreSection({
  headerTrailing,
}: {
  headerTrailing?: ReactNode;
}) {
  const industryVersion = useBrowseIndustryDatasetVersion();
  const primaries = useMemo(() => listBrowsePrimaryIndustries(), [industryVersion]);
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);

  const activeSlug = useMemo(() => {
    if (pickedSlug && primaries.some((p) => p.slug === pickedSlug)) return pickedSlug;
    return primaries[0]?.slug ?? "restaurant";
  }, [pickedSlug, primaries]);

  useEffect(() => {
    if (pickedSlug && !primaries.some((p) => p.slug === pickedSlug)) {
      setPickedSlug(null);
    }
  }, [pickedSlug, primaries]);

  const activePrimary = primaries.find((p) => p.slug === activeSlug);
  const subs = useMemo(() => listBrowseSubIndustries(activeSlug), [activeSlug, industryVersion]);

  return (
    <section id="store-industry-explore" className="scroll-mt-4">
      <div className={`overflow-hidden rounded-ui-rect border border-[#E4E6EB] bg-sam-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-[#3E4042] dark:bg-[#242526] dark:shadow-none dark:ring-1 dark:ring-sam-surface/[0.08]`}>
        <div className={`flex items-start justify-between gap-2 border-b border-[#E4E6EB] px-3 py-3 dark:border-[#3E4042]`}>
          <div className="min-w-0">
            <h2 className={FB.name}>업종 선택</h2>
            <p className={`mt-0.5 ${FB.metaSm}`}>탭으로 대분류를 고른 뒤, 세부만 골라 들어가요.</p>
          </div>
          {headerTrailing ? <div className="shrink-0 pt-0.5">{headerTrailing}</div> : null}
        </div>

        <div
          role="tablist"
          aria-label="대분류 업종"
          className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain border-b border-[#E4E6EB] px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:none] dark:border-[#3E4042] [&::-webkit-scrollbar]:hidden"
        >
          {primaries.map((p) => {
            const on = p.slug === activeSlug;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPickedSlug(p.slug)}
                className={`flex min-h-[44px] shrink-0 snap-start items-center gap-1.5 rounded-ui-rect px-3 py-2 text-[13px] font-semibold transition-colors ${
                  on ?
                    "bg-[#1877F2] text-white dark:bg-[#2374E1]"
                  : "bg-[#F0F2F5] text-[#050505] active:bg-[#E4E6EB] dark:bg-[#3A3B3C] dark:text-[#E4E6EB] dark:active:bg-[#4E4F50]"
                }`}
              >
                <span className="text-base leading-none" aria-hidden>
                  {p.symbol}
                </span>
                {p.nameKo}
              </button>
            );
          })}
        </div>

        <div className={`flex items-center justify-between gap-2 px-3 py-2 ${FB.hairline} border-b border-[#E4E6EB] dark:border-[#3E4042]`}>
          <p className={`truncate text-[13px] ${FB.meta}`}>
            <span className="font-semibold text-[#050505] dark:text-[#E4E6EB]">{activePrimary?.nameKo ?? "매장"}</span>
            <span className="text-[#65676B] dark:text-[#B0B3B8]"> · 세부 주제</span>
          </p>
          <Link
            href={storesBrowsePrimaryPath(activeSlug)}
            className={`shrink-0 text-[13px] font-semibold ${FB.link}`}
          >
            전체 보기
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
          <Link
            href={storesBrowsePrimaryPath(activeSlug)}
            className="flex min-h-[56px] flex-col items-center justify-center rounded-ui-rect bg-[#F7F8FA] px-2 py-2 text-center active:bg-[#ECEFF3] dark:bg-[#3A3B3C] dark:active:bg-[#4E4F50]"
          >
            <span className="text-[11px] font-semibold text-[#65676B] dark:text-[#B0B3B8]">모아보기</span>
            <span className="mt-0.5 text-[13px] font-bold text-[#050505] dark:text-[#E4E6EB]">전체</span>
          </Link>
          {subs.map((s) => (
            <Link
              key={s.id}
              href={storesBrowsePath(activeSlug, s.slug)}
              className="flex min-h-[56px] items-center justify-center rounded-ui-rect bg-[#F7F8FA] px-2 py-2 text-center active:bg-[#ECEFF3] dark:bg-[#3A3B3C] dark:active:bg-[#4E4F50]"
            >
              <span className="text-center text-[13px] font-semibold leading-tight text-[#050505] dark:text-[#E4E6EB]">
                {s.nameKo}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
