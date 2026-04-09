"use client";

import Link from "next/link";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";

interface MyQuickLinksProps {
  /** 찜(관심) 상품 개수 — 0보다 크면 관심목록에 뱃지 */
  favoriteCount?: number | null;
  /** 인앱 알림 미읽음 — null 이면 배지 숨김 */
  notificationUnreadCount?: number | null;
}

/** 바로가기: 관심목록 / 최근 본 글 / 혜택 / 알림 — 인스타형 아웃라인 아이콘 */
export function MyQuickLinks({ favoriteCount, notificationUnreadCount }: MyQuickLinksProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Link
        href={MYPAGE_TRADE_FAVORITES_HREF}
        className="relative flex flex-col items-center rounded-xl border border-ig-border bg-white py-4 active:bg-ig-highlight"
      >
        {favoriteCount != null && favoriteCount > 0 && (
          <span className="absolute right-3 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {favoriteCount > 99 ? "99+" : favoriteCount}
          </span>
        )}
        <span className="mb-1 flex h-8 w-8 items-center justify-center text-foreground">
          <HeartOutlineIcon />
        </span>
        <span className="text-[13px] font-medium text-foreground">관심목록</span>
      </Link>
      <Link
        href="/my/recent-viewed"
        className="flex flex-col items-center rounded-xl border border-ig-border bg-white py-4 active:bg-ig-highlight"
      >
        <span className="mb-1 flex h-8 w-8 items-center justify-center text-foreground">
          <ClockOutlineIcon />
        </span>
        <span className="text-[13px] font-medium text-foreground">최근 본 글</span>
      </Link>
      <Link
        href="/my/benefits"
        className="flex flex-col items-center rounded-xl border border-ig-border bg-white py-4 active:bg-ig-highlight"
      >
        <span className="mb-1 flex h-8 w-8 items-center justify-center text-foreground">
          <GiftOutlineIcon />
        </span>
        <span className="text-[13px] font-medium text-foreground">혜택</span>
      </Link>
      <Link
        href="/mypage/notifications"
        className="relative flex flex-col items-center rounded-xl border border-ig-border bg-white py-4 active:bg-ig-highlight"
      >
        {notificationUnreadCount != null && notificationUnreadCount > 0 && (
          <span className="absolute right-3 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}
          </span>
        )}
        <span className="mb-1 flex h-8 w-8 items-center justify-center text-foreground">
          <BellOutlineIcon />
        </span>
        <span className="text-[13px] font-medium text-foreground">알림</span>
      </Link>
    </div>
  );
}

function HeartOutlineIcon() {
  return (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}

function ClockOutlineIcon() {
  return (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function GiftOutlineIcon() {
  return (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
      />
    </svg>
  );
}

function BellOutlineIcon() {
  return (
    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}
