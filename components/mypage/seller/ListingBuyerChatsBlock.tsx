"use client";

import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";
import { SellerTradeRow } from "@/components/mypage/seller/SellerTradeRow";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type ListingBuyerChatsBlockProps = {
  tradeRows: SalesHistoryRow[];
  /** Active for-sale listing with zero buyer threads — show empty hint. */
  showEmptyHint: boolean;
};

/** Post-centric buyer chat threads under a seller listing card. */
export function ListingBuyerChatsBlock({ tradeRows, showEmptyHint }: ListingBuyerChatsBlockProps) {
  const { safeT } = useI18n();
  const hasRows = tradeRows.length > 0;

  if (!hasRows && !showEmptyHint) return null;

  const sectionLabel = safeT("marketplace_seller_listing_buyer_section", {
    fallbackKo: "구매자 문의",
    fallbackEn: "Buyer inquiries",
  });

  return (
    <div className="border-t border-sam-border-soft bg-sam-app/30">
      {hasRows ? (
        <p className="px-3 pt-2 sam-text-xxs font-medium text-sam-meta">
          {sectionLabel}
          {tradeRows.length > 1 ? ` · ${tradeRows.length}` : ""}
        </p>
      ) : null}
      {tradeRows.map((row) => (
        <SellerTradeRow key={row.chatId || `${row.postId}-${row.buyerId}`} row={row} />
      ))}
      {!hasRows && showEmptyHint ? (
        <p className="px-3 py-2.5 sam-text-helper text-sam-muted">
          {safeT("marketplace_seller_listing_no_buyer_chats", {
            fallbackKo: "아직 구매자 문의가 없어요",
            fallbackEn: "No buyer messages yet",
          })}
        </p>
      ) : null}
    </div>
  );
}
