"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getHomeChipCategories } from "@/lib/categories/getHomeChipCategories";
import type { CategoryWithSettings } from "@/lib/categories/types";
import {
  APP_MARKET_MENU_TEXT_ACTIVE,
  APP_MARKET_MENU_TEXT_BASE,
  APP_MARKET_MENU_TEXT_INACTIVE,
  APP_TOP_MENU_ROW1_ACTIVE,
  APP_TOP_MENU_ROW1_BASE,
  APP_TOP_MENU_ROW1_INACTIVE,
} from "@/lib/ui/app-top-menu";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { HomeCategoryChip } from "./HomeCategoryChip";

interface HomeCategoryChipsProps {
  /** true면 sticky/바깥 테두리 제거 — 마켓 등 상위 sticky 래퍼 안에 넣을 때 */
  embed?: boolean;
  /** pill: 홈 기본. inline-text: 구 마켓 텍스트 탭. community: 동네생활과 동일 1단(필·가로 스크롤) */
  appearance?: "pill" | "inline-text" | "community";
}

/**
 * 홈 상단 카테고리 칩 (is_active=true, sort_order, type=trade 위주)
 * "전체"는 고정 탭, 나머지는 DB 카테고리
 */
const INLINE_SCROLL_NAV =
  "-mx-1 flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

/** CommunityFeedClient 1단과 동일 톤 + 좁은 컬럼·가로 화면에서 좌측 기준 정렬 */
const COMMUNITY_ROW1_SCROLL_NAV =
  "-mx-1 flex w-full min-w-0 flex-nowrap justify-start gap-1 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

export function HomeCategoryChips({ embed = false, appearance = "pill" }: HomeCategoryChipsProps) {
  const pathname = usePathname();
  const [tradeCategories, setTradeCategories] = useState<CategoryWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getHomeChipCategories();
      setTradeCategories(list);
    } catch (e) {
      setError((e as Error).message ?? "카테고리를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-3 pt-1">
        <span
          className={
            appearance === "inline-text"
              ? `${APP_MARKET_MENU_TEXT_BASE} text-gray-400`
              : `${APP_TOP_MENU_ROW1_BASE} bg-gray-100 text-gray-400`
          }
        >
          로딩…
        </span>
      </div>
    );
  }

  const useCommunityRow1 = appearance === "community";

  if (error) {
    return (
      <div className="pb-2 text-[13px] text-red-500">
        {error}
      </div>
    );
  }

  const row1AllClass =
    appearance === "inline-text"
      ? `${APP_MARKET_MENU_TEXT_BASE} ${pathname === "/home" ? APP_MARKET_MENU_TEXT_ACTIVE : APP_MARKET_MENU_TEXT_INACTIVE}`
      : `${APP_TOP_MENU_ROW1_BASE} ${pathname === "/home" ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE}`;

  const emptyClass =
    appearance === "inline-text"
      ? `${APP_MARKET_MENU_TEXT_BASE} text-gray-400`
      : `${APP_TOP_MENU_ROW1_BASE} bg-gray-100 text-gray-500`;

  const inner = (
    <>
      <Link href="/home" className={row1AllClass}>
        전체
      </Link>
      {tradeCategories.length === 0 ? (
        <span className={emptyClass}>카테고리가 없습니다</span>
      ) : (
        tradeCategories.map((c) => (
          <HomeCategoryChip
            key={c.id}
            category={c}
            appearance={useCommunityRow1 ? "pill" : appearance === "inline-text" ? "inline-text" : "pill"}
          />
        ))
      )}
    </>
  );

  if (appearance === "inline-text") {
    return (
      <HorizontalDragScroll
        className={INLINE_SCROLL_NAV}
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label="거래 메뉴"
      >
        {inner}
      </HorizontalDragScroll>
    );
  }

  if (useCommunityRow1) {
    return (
      <HorizontalDragScroll
        className={COMMUNITY_ROW1_SCROLL_NAV}
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label="거래 메뉴"
      >
        {inner}
      </HorizontalDragScroll>
    );
  }

  const shellClass = embed
    ? "relative flex flex-shrink-0 items-center gap-1 overflow-x-auto bg-white px-0 py-1 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    : "sticky top-14 z-10 flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-gray-100 bg-white py-2 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return <div className={shellClass}>{inner}</div>;
}
