"use client";

import Link from "next/link";

interface MyQuickLinksProps {
  /** 찜(관심) 상품 개수 — 0보다 크면 관심목록에 뱃지 */
  favoriteCount?: number | null;
  /** 인앱 알림 미읽음 — null 이면 배지 숨김 */
  notificationUnreadCount?: number | null;
}

/** 바로가기: 관심목록 / 최근 본 글 / 혜택 / 알림 */
export function MyQuickLinks({ favoriteCount, notificationUnreadCount }: MyQuickLinksProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Link
        href="/my/favorites"
        className="relative flex flex-col items-center rounded-xl bg-white py-4 shadow-sm"
      >
        {favoriteCount != null && favoriteCount > 0 && (
          <span className="absolute right-3 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {favoriteCount > 99 ? "99+" : favoriteCount}
          </span>
        )}
        <span className="mb-1 text-[20px]">❤️</span>
        <span className="text-[13px] font-medium text-gray-900">관심목록</span>
      </Link>
      <Link
        href="/my/recent-viewed"
        className="flex flex-col items-center rounded-xl bg-white py-4 shadow-sm"
      >
        <span className="mb-1 text-[20px]">👁</span>
        <span className="text-[13px] font-medium text-gray-900">최근 본 글</span>
      </Link>
      <Link
        href="/my/benefits"
        className="flex flex-col items-center rounded-xl bg-white py-4 shadow-sm"
      >
        <span className="mb-1 text-[20px]">🎁</span>
        <span className="text-[13px] font-medium text-gray-900">혜택</span>
      </Link>
      <Link
        href="/my/notifications"
        className="relative flex flex-col items-center rounded-xl bg-white py-4 shadow-sm"
      >
        {notificationUnreadCount != null && notificationUnreadCount > 0 && (
          <span className="absolute right-3 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}
          </span>
        )}
        <span className="mb-1 text-[20px]">🔔</span>
        <span className="text-[13px] font-medium text-gray-900">알림</span>
      </Link>
    </div>
  );
}
