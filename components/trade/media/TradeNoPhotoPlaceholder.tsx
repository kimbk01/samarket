"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * P-4 (I2·I10): 사진 없는 거래 글의 공통 대체 그래픽 — 모든 주제 같음(주제별 아이콘 없음), 토큰 색, 부모 칸을 채운다.
 * 목록·상세·관련·찜·내 매물·채팅 썸네일이 같은 모양을 쓴다.
 */
export function TradeNoPhotoPlaceholder({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div
      data-trade-no-photo="1"
      className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-sam-surface-muted text-sam-meta"
      role="img"
      aria-label={t("trade_no_photo")}
    >
      <svg
        className={compact ? "h-4 w-4" : "h-7 w-7"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M21 16l-5-5-8 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {compact ? null : <span className="text-[12px] leading-none">{t("trade_no_photo")}</span>}
    </div>
  );
}
