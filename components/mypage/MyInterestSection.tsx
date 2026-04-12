"use client";

import Link from "next/link";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";

const ITEMS: { label: string; href: string; icon: React.ReactNode; countKey?: "favorites" }[] = [
  { label: "관심목록", href: MYPAGE_TRADE_FAVORITES_HREF, icon: <HeartIcon />, countKey: "favorites" },
  { label: "키워드 알림 설정", href: "/mypage/settings/notifications", icon: <TagIcon /> },
];

interface MyInterestSectionProps {
  /** API로 가져온 찜 상품 개수 (없으면 표시 생략) */
  favoriteCount?: number | null;
}

export function MyInterestSection({ favoriteCount }: MyInterestSectionProps) {
  return (
    <section className="rounded-ui-rect border border-ig-border bg-sam-surface p-4">
      <h2 className="mb-3 text-[13px] font-semibold text-muted">나의 관심</h2>
      <ul className="space-y-0">
        {ITEMS.map((item, i) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="flex items-center gap-3 py-3 text-[14px] text-foreground"
            >
              <span className="flex h-8 w-8 items-center justify-center text-foreground">
                {item.icon}
              </span>
              <span className="flex-1">
                {item.label}
                {item.countKey === "favorites" &&
                  favoriteCount != null &&
                  favoriteCount > 0 && (
                    <span className="ml-2 text-[12px] font-normal text-sam-muted">
                      {favoriteCount}개
                    </span>
                  )}
              </span>
              <ChevronRight />
            </Link>
            {i < ITEMS.length - 1 && <hr className="border-ig-border" />}
          </li>
        ))}
      </ul>
      {favoriteCount != null && favoriteCount === 0 && (
        <p className="-mt-1 pb-1 text-[12px] text-muted">
          찜한 상품이 없으면 홈에서 하트를 눌러 담을 수 있어요.
        </p>
      )}
    </section>
  );
}

function HeartIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
