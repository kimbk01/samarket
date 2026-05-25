"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  const { t } = useI18n();
  const trimmedStoreName = storeName?.trim() || t("store_fallback_name");
  const fallback = storeName?.trim()
    ? t("store_notice_store_suffix", { store: trimmedStoreName })
    : t("store_notice_check_fallback");
  const line = text.trim() || fallback;

  return (
    <div className="delivery-ui border-b border-[color:var(--delivery-border)] bg-white px-4 py-3">
      <Link
        href={href}
        className="flex min-h-[48px] touch-manipulation items-center gap-2.5 rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-white px-3 py-2.5 transition-colors active:scale-[0.99] active:bg-[color:var(--delivery-primary-soft)]"
      >
        <span className="shrink-0 text-[color:var(--delivery-primary)]">
          <NoticeGlyph className="opacity-90" />
        </span>
        <p className="min-w-0 flex-1 line-clamp-1 text-[14px] font-bold leading-snug text-neutral-900">{line}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {showCouponBadge ? (
            <span className="delivery-badge delivery-badge--primary">
              {t("store_badge_coupon")}
            </span>
          ) : null}
          <NoticeChevron className="shrink-0 text-neutral-300" />
        </div>
      </Link>
    </div>
  );
}
