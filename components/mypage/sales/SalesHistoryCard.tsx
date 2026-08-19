"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils/format";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import { salesTradeStatusBadge } from "@/lib/mypage/sales-history-ui";
import { formatTradeListDatetime } from "@/lib/mypage/format-trade-datetime";
import { BuyerReviewReadSheet } from "@/components/mypage/purchases/BuyerReviewReadSheet";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { Sam } from "@/lib/ui/sam-component-classes";

export interface SalesHistoryRow {
  chatId: string;
  postId: string;
  /** product_chats 행이 없을 때 true — 채팅/거래완료 등 비활성 */
  noActiveChat?: boolean;
  /** 판매자(글 소유자) — API에서 내려옴 */
  sellerId?: string;
  buyerId: string;
  buyerNickname: string;
  title: string;
  price: number;
  status: string;
  sellerListingState?: string;
  thumbnail: string;
  lastMessageAt: string | null;
  lastMessagePreview?: string;
  tradeFlowStatus?: string;
  chatMode?: string;
  createdAt: string | null;
  sellerCompletedAt: string | null;
  buyerConfirmedAt: string | null;
  hasBuyerReview: boolean;
  buyerConfirmSource?: string | null;
  soldBuyerId?: string | null;
  /** 게시글 요약의 수정 시각 — `/api/my/sales` 의 `postUpdatedAt` */
  postUpdatedAt?: string | null;
  /** `postUpdatedAt` 과 동일 의미(레거시·빌드 호환) */
  updatedAt?: string | null;
}

export function SalesHistoryCard({
  row,
  currency,
}: {
  row: SalesHistoryRow;
  currency: string;
  viewerId: string;
  onReload: () => void;
}) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [readBuyerReview, setReadBuyerReview] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasChat = Boolean(row.chatId?.trim()) && !row.noActiveChat;

  const tradeBadge = salesTradeStatusBadge(t, row.tradeFlowStatus ?? "chatting");
  const tradeAt = row.buyerConfirmedAt || row.sellerCompletedAt || row.createdAt || row.lastMessageAt;
  const detailHref = `/post/${row.postId}`;
  const chatHref = hasChat ? tradeHubChatRoomHref(row.chatId, "product_chat") : detailHref;

  useEffect(() => {
    setThumbFailed(false);
  }, [row.thumbnail, row.chatId]);

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

  return (
    <li className="relative rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
      <div className="flex gap-2 p-3">
        <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
          <SamarketThumbnail
            src={thumbFailed ? null : row.thumbnail}
            fill
            roundedClassName="rounded-ui-rect"
            className="bg-sam-surface-muted"
            fallbackSrc=""
            onImageError={() => setThumbFailed(true)}
            fallbackNode={
              <div className="flex h-full items-center justify-center sam-text-xxs text-sam-meta">
                {t("mypage_comp_image_placeholder")}
              </div>
            }
          />
        </div>
        <div className="min-w-0 flex-1 pr-1">
          <p className="line-clamp-2 sam-text-body font-medium text-sam-fg">
            {row.title || t("mypage_comp_image_placeholder")}
          </p>
          <p className="mt-0.5 sam-text-body font-bold text-sam-fg">{formatPrice(row.price, currency)}</p>
          <p className="mt-0.5 truncate sam-text-helper text-sam-muted">
            {hasChat ? `${t("mypage_comp_actor_buyer")} ${row.buyerNickname}` : t("mypage_comp_sales_no_chat_yet")}
          </p>
          <p className="mt-0.5 sam-text-xxs text-sam-meta">
            {t("mypage_comp_trade_at_line", { datetime: formatTradeListDatetime(tradeAt) })}
          </p>
          <p className="mt-1 sam-text-helper text-sam-fg">
            {safeT("marketplace_seller_trade_status_label", {
              fallbackKo: "거래 상태",
              fallbackEn: "Trade status",
            })}
            {": "}
            <span className="font-medium">{tradeBadge}</span>
          </p>
          <Link
            href={detailHref}
            onPointerEnter={() => void router.prefetch(detailHref)}
            onFocus={() => void router.prefetch(detailHref)}
            onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
            className="mt-2 inline-block sam-text-helper font-medium text-sam-muted underline-offset-2 hover:text-sam-fg hover:underline"
          >
            {safeT("marketplace_seller_view_product", {
              fallbackKo: "상품 보기",
              fallbackEn: "View item",
            })}
          </Link>
        </div>
        <div className="relative shrink-0 pt-0.5" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-ui-rect p-2 text-sam-muted hover:bg-sam-surface-muted"
            aria-label={t("mypage_comp_more_aria")}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-9 z-[60] min-w-[200px] rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-sam-elevated">
              {hasChat && row.hasBuyerReview ? (
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
              {hasChat && row.buyerId ? (
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
              {!hasChat && !row.hasBuyerReview && !row.buyerId ? (
                <span className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-meta">
                  {t("mypage_comp_sales_chat_none_menu")}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {hasChat ? (
        <div className="border-t border-sam-border-soft px-3 pb-3 pt-2">
          <Link href={chatHref} className={`${Sam.btn.primaryCombo} ${Sam.btn.block} py-2.5 text-center`}>
            {safeT("marketplace_seller_trade_chat_primary", {
              fallbackKo: "거래 채팅",
              fallbackEn: "Trade chat",
            })}
          </Link>
        </div>
      ) : null}

      {readBuyerReview && hasChat ? (
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
    </li>
  );
}
