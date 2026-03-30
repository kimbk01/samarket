"use client";

import Link from "next/link";
import type { MyPageSectionRow } from "@/lib/my/types";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";

/**
 * 내정보(`/mypage`·`/my`) 「개인 메뉴」 타일 목적지.
 * `deals`(나의 거래)는 개인 중고 거래 허브 — 구매/판매/찜/후기/채팅이 `/mypage/trade`에 있음.
 */
const SECTION_ROUTES: Record<string, string> = {
  deals: "/mypage/trade/purchases",
  interests: MYPAGE_TRADE_FAVORITES_HREF,
  activity: "/my/reviews",
  business: "/my/business",
};

export interface MySectionListProps {
  sections: MyPageSectionRow[];
  /** 나의 관심 섹션에 표시할 찜 상품 개수 */
  interestFavoriteCount?: number | null;
}

export function MySectionList({ sections, interestFavoriteCount }: MySectionListProps) {
  return (
    <div className="space-y-3">
      {sections.map((sec) => {
        const href = SECTION_ROUTES[sec.section_key] ?? "#";
        const showInterestCount =
          sec.section_key === "interests" &&
          interestFavoriteCount != null &&
          interestFavoriteCount > 0;
        return (
          <Link
            key={sec.section_key}
            href={href}
            className="flex items-center justify-between rounded-xl border border-[#DBDBDB] bg-white px-4 py-3 active:bg-[#FAFAFA]"
          >
            <span className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center text-[#262626]">
              <SectionGlyph sectionKey={sec.section_key} />
            </span>
            <span className="flex-1 text-[15px] font-medium text-[#262626]">
              {sec.title}
              {showInterestCount && (
                <span className="ml-2 text-[13px] font-normal text-[#8E8E8E]">
                  관심 {interestFavoriteCount}개
                </span>
              )}
            </span>
            <span className="text-[#8E8E8E]">
              <ChevronIcon />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function SectionGlyph({ sectionKey }: { sectionKey: string }) {
  switch (sectionKey) {
    case "deals":
      return <PackageIcon />;
    case "interests":
      return <HeartIcon />;
    case "activity":
      return <StarIcon />;
    case "business":
      return <StoreIcon />;
    default:
      return <DotIcon />;
  }
}

function PackageIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l8 4m0-10V4m-8 6v10l8 4" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
      />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
