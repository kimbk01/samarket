"use client";

import Link from "next/link";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export const POST_DETAIL_REGION_BAR_PX = 56;
/** RegionBar(1단) 하단 ~ 고정 네비 행 `top` 간격(px) */
export const POST_DETAIL_NAV_VERTICAL_GAP_PX = 1;
export const POST_DETAIL_NAV_ROW_PX = 52;
/** 뷰포트 기준 네비 `top` — 1단 하단 + NAV_VERTICAL_GAP */
export const POST_DETAIL_NAV_TOP_PX = POST_DETAIL_REGION_BAR_PX + POST_DETAIL_NAV_VERTICAL_GAP_PX;
/** 뷰포트 기준 네비 행 하단 Y — 스크롤 시 실선 전환 판별 */
export const POST_DETAIL_NAV_STACK_BOTTOM_PX = POST_DETAIL_NAV_TOP_PX + POST_DETAIL_NAV_ROW_PX;

/** main 상단(~1단 하단) → 이미지 시작 패딩(px). 네비는 fixed로 겹침; 1단~네비 간격과 별도 */
export const POST_DETAIL_IMAGE_INSET_BELOW_MAIN_TOP_PX = 2;

/** 글 상세 공통: RegionBar 아래 고정 — 뒤로·홈·더보기(⋮) */
export function PostDetailStickyNavBar({
  detailNavSolid,
  backHref,
  isOwnPost,
  onOpenMore,
  onOpenSellerMore,
}: {
  detailNavSolid: boolean;
  backHref: string;
  isOwnPost: boolean;
  /** 구매자 ⋮ (신고 등) */
  onOpenMore: () => void;
  /** 판매자 본인 글 ⋮ — 없으면 자리만 비움 */
  onOpenSellerMore?: () => void;
}) {
  return (
    <div
      className={`pointer-events-none fixed left-0 right-0 z-[40] flex justify-center transition-[background-color,border-color] duration-200 ${
        detailNavSolid ? "border-b border-gray-200 bg-white/95 backdrop-blur-sm" : "border-b border-transparent bg-transparent"
      }`}
      style={{ top: POST_DETAIL_NAV_TOP_PX }}
    >
      <div
        className="pointer-events-auto flex w-full max-w-lg items-center justify-between px-1.5"
        style={{ height: POST_DETAIL_NAV_ROW_PX }}
      >
        <div className="flex items-center">
          <AppBackButton
            backHref={backHref}
            className={
              detailNavSolid
                ? "bg-transparent text-gray-900 hover:bg-gray-100"
                : "bg-black/9 text-white hover:bg-black/40"
            }
            ariaLabel="뒤로가기"
          />
          <Link
            href="/home"
            className={
              detailNavSolid
                ? "flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-gray-900 hover:bg-gray-100"
                : "flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center bg-black/9 text-white hover:bg-black/40"
            }
            aria-label="홈"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </Link>
        </div>
        {!isOwnPost ? (
          <button
            type="button"
            onClick={onOpenMore}
            className={
              detailNavSolid
                ? "flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-gray-900 hover:bg-gray-100"
                : "flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center bg-black/9 text-white shadow-sm hover:bg-black/40"
            }
            aria-label="더보기"
          >
            <svg
              className={
                detailNavSolid
                  ? "h-7 w-7 shrink-0"
                  : "h-7 w-7 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
              }
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <circle cx="12" cy="5" r="2.5" />
              <circle cx="12" cy="12" r="2.5" />
              <circle cx="12" cy="19" r="2.5" />
            </svg>
          </button>
        ) : onOpenSellerMore ? (
          <button
            type="button"
            onClick={onOpenSellerMore}
            className={
              detailNavSolid
                ? "flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-gray-900 hover:bg-gray-100"
                : "flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center bg-black/9 text-white shadow-sm hover:bg-black/40"
            }
            aria-label="더보기"
          >
            <svg
              className={
                detailNavSolid
                  ? "h-7 w-7 shrink-0"
                  : "h-7 w-7 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
              }
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <circle cx="12" cy="5" r="2.5" />
              <circle cx="12" cy="12" r="2.5" />
              <circle cx="12" cy="19" r="2.5" />
            </svg>
          </button>
        ) : (
          <span className="h-11 w-11 min-w-[44px] shrink-0" aria-hidden />
        )}
      </div>
    </div>
  );
}
