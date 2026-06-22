"use client";

import { VoiceMessageBufferingSpinner } from "@/components/community-messenger/VoiceMessageBufferingSpinner";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type TradeListLoadMoreFooterProps = {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  visibleCount: number;
  totalCount: number;
  /** 서버 페이지네이션 등 전체 건수 미확정 시 카운트 숨김 */
  showCount?: boolean;
};

/** 거래·커뮤니티 거래 리스트 공통 — 더보기 + 버퍼 스피너 */
export function TradeListLoadMoreFooter({
  hasMore,
  loadingMore,
  onLoadMore,
  visibleCount,
  totalCount,
  showCount = true,
}: TradeListLoadMoreFooterProps) {
  const { safeT } = useI18n();

  if (!hasMore && !loadingMore) return null;

  const loadMoreLabel = safeT("cm_trade_chat_list_load_more", {
    fallbackKo: "더보기",
    fallbackEn: "Load more",
  });
  const loadingLabel = safeT("cm_trade_chat_list_loading_more", {
    fallbackKo: "불러오는 중",
    fallbackEn: "Loading",
  });

  return (
    <div
      className="flex flex-col items-center gap-2 border-t border-[#E5EEE9] bg-[#F8FAF9] px-4 py-4"
      data-trade-list-load-more="true"
    >
      {loadingMore ? (
        <div className="flex items-center gap-2 text-[13px] font-medium text-[#6B7280]">
          <VoiceMessageBufferingSpinner light={false} label={loadingLabel} />
          <span>{loadingLabel}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="inline-flex h-10 min-w-[120px] items-center justify-center rounded-full border border-[#D7E5DE] bg-white px-5 text-[13px] font-semibold text-[#006241] transition active:scale-[0.98] active:bg-[#EAF4EF]"
        >
          {loadMoreLabel}
          <span className="sr-only">
            {safeT("cm_trade_chat_list_load_more_count", {
              fallbackKo: `${visibleCount} / ${totalCount}`,
              fallbackEn: `${visibleCount} / ${totalCount}`,
              vars: { visible: visibleCount, total: totalCount },
            })}
          </span>
        </button>
      )}
      {!loadingMore && showCount ? (
        <p className="text-[11px] font-medium tabular-nums text-[#9CA3AF]">
          {visibleCount} / {totalCount}
        </p>
      ) : null}
    </div>
  );
}
