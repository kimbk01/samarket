"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import { BuyerReviewReadSheet } from "@/components/mypage/purchases/BuyerReviewReadSheet";
import { sellerEmbeddedTradeRowStatusLabel } from "@/lib/mypage/sales-history-ui";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { formatTimeAgo } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";

/** Embedded buyer trade row under a listing card — compact, chat-first. */
export function SellerTradeRow({ row }: { row: SalesHistoryRow }) {
  const { t, safeT } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [readBuyerReview, setReadBuyerReview] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasChat = Boolean(row.chatId?.trim()) && !row.noActiveChat;
  const chatHref = hasChat ? tradeHubChatRoomHref(row.chatId, "product_chat") : "#";
  const tradeStatusLabel = sellerEmbeddedTradeRowStatusLabel(t, row);
  const buyerLabel = row.buyerNickname?.trim()
    ? row.buyerNickname.trim()
    : t("mypage_comp_sales_no_chat_yet");
  const preview = row.lastMessagePreview?.trim() ?? "";
  const timeRaw = row.lastMessageAt ?? row.createdAt;
  const timeLabel = timeRaw ? formatTimeAgo(timeRaw) : "";

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close, { passive: true });
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [menuOpen]);

  if (!hasChat) return null;

  const chatCta = safeT("marketplace_seller_trade_chat_primary", {
    fallbackKo: "거래 채팅",
    fallbackEn: "Trade chat",
  });

  return (
    <>
      <div className="flex items-stretch border-t border-sam-border-soft first:border-t-0">
        <Link
          href={chatHref}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 hover:bg-sam-surface-muted/80 active:bg-sam-surface-muted"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate sam-text-body-secondary font-medium text-sam-fg">{buyerLabel}</p>
            <p className="mt-0.5 sam-text-helper text-sam-muted">{tradeStatusLabel}</p>
            {preview ? (
              <p className="mt-0.5 truncate sam-text-helper text-sam-fg">{preview}</p>
            ) : null}
            {timeLabel ? <p className="mt-0.5 sam-text-xxs text-sam-meta">{timeLabel}</p> : null}
          </div>
          <span className="flex shrink-0 items-center gap-0.5 sam-text-helper font-medium text-sam-brand">
            {chatCta}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </Link>
        <div
          className="relative flex shrink-0 items-center border-l border-sam-border-soft pr-1"
          ref={menuRef}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-ui-rect p-2 text-sam-muted hover:bg-sam-surface-muted"
            aria-label={t("mypage_comp_more_aria")}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-9 z-[60] min-w-[180px] rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-sam-elevated">
              {row.hasBuyerReview ? (
                <button
                  type="button"
                  onClick={() => {
                    setReadBuyerReview(true);
                    setMenuOpen(false);
                  }}
                  className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
                >
                  {t("mypage_comp_sales_buyer_review_view")}
                </button>
              ) : null}
              {row.buyerId ? (
                <button
                  type="button"
                  onClick={() => {
                    setReportOpen(true);
                    setMenuOpen(false);
                  }}
                  className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
                >
                  {t("mypage_comp_sales_report_block")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {readBuyerReview ? (
        <BuyerReviewReadSheet
          chatId={row.chatId}
          perspective="seller_sees_buyer"
          onClose={() => setReadBuyerReview(false)}
        />
      ) : null}

      {reportOpen ? (
        <ReportActionSheet
          targetType="user"
          targetId={row.buyerId}
          targetUserId={row.buyerId}
          targetLabel={row.buyerNickname}
          roomId={row.chatId}
          productId={row.postId}
          onClose={() => setReportOpen(false)}
          onSuccess={() => setReportOpen(false)}
        />
      ) : null}
    </>
  );
}
