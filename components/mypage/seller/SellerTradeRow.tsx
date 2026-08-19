"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import { BuyerReviewReadSheet } from "@/components/mypage/purchases/BuyerReviewReadSheet";
import { salesTradeStatusBadge } from "@/lib/mypage/sales-history-ui";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";

/** Embedded buyer trade row under a listing card — chat-first, no duplicate product block. */
export function SellerTradeRow({ row }: { row: SalesHistoryRow }) {
  const { t, safeT } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [readBuyerReview, setReadBuyerReview] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasChat = Boolean(row.chatId?.trim()) && !row.noActiveChat;
  const chatHref = hasChat ? tradeHubChatRoomHref(row.chatId, "product_chat") : "#";
  const tradeBadge = salesTradeStatusBadge(t, row.tradeFlowStatus ?? "chatting");
  const buyerLabel = row.buyerNickname?.trim()
    ? row.buyerNickname.trim()
    : t("mypage_comp_sales_no_chat_yet");

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

  return (
    <div className="border-t border-sam-border-soft px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate sam-text-body-secondary font-medium text-sam-fg">{buyerLabel}</p>
          <p className="mt-0.5 sam-text-helper text-sam-muted">{tradeBadge}</p>
        </div>
        <div className="relative shrink-0" ref={menuRef}>
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
      <Link
        href={chatHref}
        className={`${Sam.btn.primaryCombo} ${Sam.btn.block} mt-2 py-2.5 text-center sam-text-body-secondary`}
      >
        {safeT("marketplace_seller_trade_chat_primary", {
          fallbackKo: "거래 채팅",
          fallbackEn: "Trade chat",
        })}
      </Link>

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
    </div>
  );
}
