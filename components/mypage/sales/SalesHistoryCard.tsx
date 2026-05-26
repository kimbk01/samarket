"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils/format";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import {
  salesCanChangeListing,
  salesCanSellerCompleteTrade,
  salesCardTradeLine,
  salesProductStatusBadge,
  salesTradeStatusBadge,
} from "@/lib/mypage/sales-history-ui";
import { formatTradeListDatetime } from "@/lib/mypage/format-trade-datetime";
import { BuyerReviewReadSheet } from "@/components/mypage/purchases/BuyerReviewReadSheet";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { SELLER_LISTING_LABEL, type SellerListingState } from "@/lib/products/seller-listing-state";
import { SELLER_CANCEL_SALE_CONFIRM_MESSAGE } from "@/lib/posts/seller-cancel-sale-ui";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

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
  viewerId,
  onReload,
}: {
  row: SalesHistoryRow;
  currency: string;
  viewerId: string;
  onReload: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [readBuyerReview, setReadBuyerReview] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasChat = Boolean(row.chatId?.trim()) && !row.noActiveChat;

  const tradeBadge = salesTradeStatusBadge(t, row.tradeFlowStatus ?? "chatting");
  const productBadge = salesProductStatusBadge(row.sellerListingState, row.status);
  const tradeLine = salesCardTradeLine(t, row.tradeFlowStatus, row.hasBuyerReview, row.buyerConfirmSource);
  const canListing = salesCanChangeListing(row.status);
  const canSellerComplete =
    hasChat && salesCanSellerCompleteTrade(row.tradeFlowStatus, row.status);
  const canCancelSale = !["sold", "hidden", "deleted", "blinded"].includes(
    String(row.status ?? "").toLowerCase()
  );
  const tradeAt = row.buyerConfirmedAt || row.sellerCompletedAt || row.createdAt || row.lastMessageAt;
  const detailHref = `/post/${row.postId}`;

  const persistListing = async (next: SellerListingState) => {
    const label = SELLER_LISTING_LABEL[next];
    if (typeof window !== "undefined" && !window.confirm(t("mypage_comp_sales_listing_change_confirm", { label }))) {
      return;
    }
    setActionBusy("listing");
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(row.postId)}/seller-listing-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerListingState: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) onReload();
      else if (data.error) window.alert(data.error);
    } catch {
      /* ignore */
    } finally {
      setActionBusy((prev) => (prev === null ? prev : null));
      setMenuOpen((prev) => (prev ? false : prev));
    }
  };

  const runCancelSale = async () => {
    if (typeof window !== "undefined" && !window.confirm(SELLER_CANCEL_SALE_CONFIRM_MESSAGE)) {
      return;
    }
    setActionBusy("cancel");
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(row.postId)}/owner-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: "hidden" }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) onReload();
      else if (data.error) window.alert(data.error);
    } catch {
      /* ignore */
    } finally {
      setActionBusy((prev) => (prev === null ? prev : null));
      setMenuOpen((prev) => (prev ? false : prev));
    }
  };

  const runSellerComplete = async () => {
    if (!hasChat) return;
    if (typeof window !== "undefined" && !window.confirm(t("mypage_comp_sales_complete_confirm"))) {
      return;
    }
    setActionBusy("complete");
    try {
      const res = await fetch(`/api/trade/product-chat/${encodeURIComponent(row.chatId)}/seller-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) onReload();
      else if (data.error) window.alert(data.error);
    } catch {
      /* ignore */
    } finally {
      setActionBusy((prev) => (prev === null ? prev : null));
      setMenuOpen((prev) => (prev ? false : prev));
    }
  };

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
        <Link
          href={detailHref}
          onPointerEnter={() => void router.prefetch(detailHref)}
          onFocus={() => void router.prefetch(detailHref)}
          onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
          className="flex min-w-0 flex-1 gap-3"
        >
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
            <p className="line-clamp-2 sam-text-body font-medium text-sam-fg">{row.title || t("mypage_comp_image_placeholder")}</p>
            <p className="mt-0.5 sam-text-body font-bold text-sam-fg">{formatPrice(row.price, currency)}</p>
            <p className="mt-0.5 truncate sam-text-helper text-sam-muted">
              {hasChat ? `${t("mypage_comp_actor_buyer")} ${row.buyerNickname}` : t("mypage_comp_sales_no_chat_yet")}
            </p>
            <p className="mt-0.5 sam-text-xxs text-sam-meta">{t("mypage_comp_trade_at_line", { datetime: formatTradeListDatetime(tradeAt) })}</p>
            <p className="mt-0.5 sam-text-xxs text-sam-fg">{tradeLine}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="rounded-ui-rect bg-amber-50 px-1.5 py-0.5 sam-text-xxs font-medium text-amber-900">
                {t("mypage_comp_order_items_heading")} · {productBadge}
              </span>
              <span className="rounded-ui-rect bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs font-medium text-sam-fg">
                {t("mypage_comp_timeline_section")} · {tradeBadge}
              </span>
              <span
                className={`rounded-ui-rect px-1.5 py-0.5 sam-text-xxs font-medium ${
                  row.hasBuyerReview ? "bg-emerald-50 text-emerald-800" : "bg-sam-surface-muted text-sam-muted"
                }`}
              >
                {row.hasBuyerReview ? t("mypage_comp_sales_buyer_review_arrived") : t("mypage_comp_sales_buyer_review_none")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 sam-text-helper">
              {hasChat ? (
                <span className="rounded-full border border-sam-border bg-signature/5 px-2.5 py-1 font-medium text-sam-fg">
                  {t("mypage_comp_sales_chat_available_hint")}
                </span>
              ) : (
                <span className="rounded-full border border-sam-border bg-sam-app px-2.5 py-1 font-medium text-sam-muted">
                  {t("mypage_comp_sales_chat_unavailable_hint")}
                </span>
              )}
            </div>
          </div>
        </Link>
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
              {hasChat ? (
                <Link
                  href={tradeHubChatRoomHref(row.chatId, "product_chat")}
                  onClick={() => setMenuOpen(false)}
                  className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
                >
                  {t("mypage_comp_order_chat_view")}
                </Link>
              ) : (
                <span className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-meta">
                  {t("mypage_comp_sales_chat_none_menu")}
                </span>
              )}
              {canListing ? (
                <>
                  <button
                    type="button"
                    disabled={!!actionBusy}
                    onClick={() => void persistListing("inquiry")}
                    className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
                  >
                    {actionBusy === "listing" ? t("mypage_comp_processing") : t("mypage_comp_sales_to_inquiry")}
                  </button>
                  <button
                    type="button"
                    disabled={!!actionBusy}
                    onClick={() => void persistListing("negotiating")}
                    className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
                  >
                    {t("mypage_comp_sales_to_negotiating")}
                  </button>
                  <button
                    type="button"
                    disabled={!!actionBusy}
                    onClick={() => void persistListing("reserved")}
                    className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
                  >
                    {t("mypage_comp_sales_to_reserved")}
                  </button>
                </>
              ) : null}
              {canSellerComplete ? (
                <button
                  type="button"
                  disabled={!!actionBusy}
                  onClick={() => void runSellerComplete()}
                  className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app disabled:opacity-50"
                >
                  {actionBusy === "complete" ? t("mypage_comp_processing") : t("mypage_comp_sales_complete_irreversible")}
                </button>
              ) : null}
              {canCancelSale ? (
                <button
                  type="button"
                  disabled={!!actionBusy}
                  onClick={() => void runCancelSale()}
                  className="block w-full border-t border-sam-border-soft px-4 py-2.5 text-left sam-text-body text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {actionBusy === "cancel" ? t("mypage_comp_processing") : t("mypage_comp_product_cancel_sale")}
                </button>
              ) : null}
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
              <Link
                href={detailHref}
                onPointerEnter={() => void router.prefetch(detailHref)}
                onFocus={() => void router.prefetch(detailHref)}
                onClick={() => {
                  beginRouteEntryPerf("product_detail", detailHref);
                  setMenuOpen(false);
                }}
                className="block w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
              >
                {t("mypage_comp_sales_view_post")}
              </Link>
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
            </div>
          ) : null}
        </div>
      </div>

      {hasChat ? (
        <div className="border-t border-sam-border-soft px-3 pb-3 pt-2">
          <Link
            href={tradeHubChatRoomHref(row.chatId, "product_chat")}
            className="block w-full rounded-ui-rect border border-sam-border bg-signature/5 py-2.5 text-center sam-text-body-secondary font-semibold text-sam-fg"
          >
            {t("mypage_comp_order_chat_revisit")}
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
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface">
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
          </div>
        </div>
      ) : null}
    </li>
  );
}
