"use client";

import Link from "next/link";
import type { MyPageSectionRow } from "@/lib/my/types";

const SECTION_ROUTES: Record<string, string> = {
  deals: "/my/products",
  interests: "/my/favorites",
  activity: "/my/reviews",
  business: "/my/business",
};

const SECTION_ICONS: Record<string, string> = {
  deals: "📦",
  interests: "❤️",
  activity: "⭐",
  business: "🏪",
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
        const icon = SECTION_ICONS[sec.section_key] ?? "•";
        const showInterestCount =
          sec.section_key === "interests" &&
          interestFavoriteCount != null &&
          interestFavoriteCount > 0;
        return (
          <Link
            key={sec.section_key}
            href={href}
            className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm"
          >
            <span className="mr-2 text-[18px]">{icon}</span>
            <span className="flex-1 text-[15px] font-medium text-gray-900">
              {sec.title}
              {showInterestCount && (
                <span className="ml-2 text-[13px] font-normal text-gray-500">
                  관심 {interestFavoriteCount}개
                </span>
              )}
            </span>
            <span className="text-gray-400">
              <ChevronIcon />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
