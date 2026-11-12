"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { usePhilifeWriteSheet } from "@/contexts/PhilifeWriteSheetContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import {
  MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS,
  MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS,
} from "@/lib/main-menu/bottom-nav-config";

/**
 * 정보교환 글쓰기 — 오른쪽 아래 떠 있는 버튼 「✎ 글쓰기」 (Owner 「3판대로 구현」 2026-11-12, 시안 W3).
 * 예전 1단 초록 사각 버튼(메신저 색 #006241 채움)을 1단에서 빼고, 모임 「＋ 모임 만들기」와 같은 모양으로 옮겼다.
 * 누르면 지금과 같은 글쓰기 시트(지금 고른 주제 그대로 · 작성 중 이동 막기 그대로).
 * 정보교환 목록(`CommunityFeed`)에서만 그린다 — 하단 탭을 바꾸면 보관된 화면과 함께 숨는다.
 */
export function PhilifeComposeFab() {
  return (
    <Suspense fallback={null}>
      <PhilifeComposeFabInner />
    </Suspense>
  );
}

const FAB_CLASS = [
  "fixed right-4",
  MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS,
  MAIN_BOTTOM_NAV_FAB_SECTOR_Z_CLASS,
  "inline-flex items-center gap-1.5 rounded-full bg-sam-primary px-4 py-2.5 text-[14px] font-bold text-sam-on-primary shadow-lg",
  "transition-[transform,background-color] duration-100 ease-out active:scale-[0.97] active:bg-sam-primary-hover",
  "[-webkit-tap-highlight-color:transparent] motion-reduce:transition-none motion-reduce:active:scale-100",
].join(" ");

function PhilifeComposeFabInner() {
  const { t } = useI18n();
  const { open: openWriteSheet } = usePhilifeWriteSheet();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const searchParams = useSearchParams();
  const category = searchParams.get("category")?.trim() ?? "";

  return (
    <button
      type="button"
      data-philife-compose-fab=""
      onClick={() => {
        if (!guardBeforeNavigate()) return;
        openWriteSheet(category);
      }}
      className={FAB_CLASS}
      aria-label={t("tier1_community_write")}
    >
      <svg
        className="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12.5 5.5l6 6L9 21H3v-6L12.5 5.5z" />
        <path d="M10.5 7.5l6 6" />
      </svg>
      <span>{t("community_compose_fab")}</span>
    </button>
  );
}
