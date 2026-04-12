"use client";

import Link from "next/link";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";

const ITEMS: {
  label: string;
  href: string;
  icon: React.ReactNode;
  hasAlert?: boolean;
  showFavoriteBadge?: boolean;
}[] = [
  { label: "관심목록", href: MYPAGE_TRADE_FAVORITES_HREF, icon: <HeartIcon />, showFavoriteBadge: true },
  { label: "최근 본 글", href: "/my/recent-viewed", icon: <ClockIcon /> },
  { label: "혜택", href: "/my/benefits", icon: <GiftIcon />, hasAlert: true },
  { label: "배달 주문", href: "/my/store-orders", icon: <BagIcon /> },
];

interface SummaryMenuProps {
  favoriteCount?: number | null;
}

export function SummaryMenu({ favoriteCount }: SummaryMenuProps) {
  return (
    <section className="rounded-ui-rect border border-ig-border bg-sam-surface p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ITEMS.map(({ label, href, icon, hasAlert, showFavoriteBadge }) => (
          <Link
            key={label}
            href={href}
            className="flex flex-col items-center gap-2 py-3 text-[14px] text-foreground"
          >
            <span className="relative flex h-10 w-10 items-center justify-center text-foreground">
              {icon}
              {hasAlert && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-signature" />
              )}
              {showFavoriteBadge && favoriteCount != null && favoriteCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {favoriteCount > 99 ? "99+" : favoriteCount}
                </span>
              )}
            </span>
            <span className="text-center leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HeartIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
function GiftIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
      />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 11V7a4 4 0 10-8 0v4M5 9h14l1 12H4L5 9z"
      />
    </svg>
  );
}
