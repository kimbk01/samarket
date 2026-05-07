"use client";

import Link from "next/link";

function NoticeChevron({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M9 18l6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NoticeGlyph({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M19 9.5V16M5 9h3l5-3v12l-5-3H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 매장 상세 상단 공지 한 줄(배달앱형: 흰 배경·구분선·텍스트·쉐브론, 둥근 컬러 카드 아님).
 */
export function StoreOrderNoticeStrip({
  text,
  href,
  storeName,
  showCouponBadge,
}: {
  text: string;
  href: string;
  storeName?: string;
  /** 실데이터 연동 전까지 false 유지(mock 금지) */
  showCouponBadge?: boolean;
}) {
  const fallback = storeName?.trim() ? `${storeName.trim()} 입니다.` : "매장 공지를 확인해 보세요";
  const line = text.trim() || fallback;

  return (
    <div className="border-b border-neutral-100 bg-white px-5 py-3">
      <Link
        href={href}
        className="flex min-h-[46px] touch-manipulation items-center gap-2.5 rounded-[8px] border border-neutral-200 bg-white px-3 py-2.5 transition-colors active:bg-[#E6F4F9]/60 active:scale-[0.99]"
      >
        <span className="shrink-0 text-[#1C8DB8]">
          <NoticeGlyph className="opacity-90" />
        </span>
        <p className="min-w-0 flex-1 line-clamp-1 text-[14px] font-bold leading-snug text-neutral-900">{line}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {showCouponBadge ? (
            <span className="rounded-full bg-[#1C8DB8]/12 px-2 py-0.5 text-[11px] font-bold text-[#1C8DB8]">
              쿠폰
            </span>
          ) : null}
          <NoticeChevron className="shrink-0 text-neutral-300" />
        </div>
      </Link>
    </div>
  );
}
