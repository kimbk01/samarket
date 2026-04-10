"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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

export interface SalesHistoryRow {
  chatId: string;
  postId: string;
  /** product_chats 행이 없을 때 true — 채팅/거래완료 등 비활성 */
  noActiveChat?: boolean;
  buyerId: string;
  buyerNickname: string;
  title: string;
  price: number;
  status: string;
  sellerListingState?: string;
  thumbnail: string;
  lastMessageAt: string | null;
  tradeFlowStatus?: string;
  createdAt: string | null;
  sellerCompletedAt: string | null;
  buyerConfirmedAt: string | null;
  hasBuyerReview: boolean;
  buyerConfirmSource?: string | null;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [readBuyerReview, setReadBuyerReview] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasChat = Boolean(row.chatId?.trim()) && !row.noActiveChat;

  const tradeBadge = salesTradeStatusBadge(row.tradeFlowStatus ?? "chatting");
  const productBadge = salesProductStatusBadge(row.sellerListingState, row.status);
  const tradeLine = salesCardTradeLine(row.tradeFlowStatus, row.hasBuyerReview, row.buyerConfirmSource);
  const canListing = salesCanChangeListing(row.status);
  const canSellerComplete =
    hasChat && salesCanSellerCompleteTrade(row.tradeFlowStatus, row.status);
  const canCancelSale = !["sold", "hidden", "deleted", "blinded"].includes(
    String(row.status ?? "").toLowerCase()
  );
  const tradeAt = row.buyerConfirmedAt || row.sellerCompletedAt || row.createdAt || row.lastMessageAt;

  const persistListing = async (next: SellerListingState) => {
    const label = SELLER_LISTING_LABEL[next];
    if (typeof window !== "undefined" && !window.confirm(`물품 상태를 "${label}"(으)로 바꿀까요?`)) {
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
      setActionBusy(null);
      setMenuOpen(false);
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
      setActionBusy(null);
      setMenuOpen(false);
    }
  };

  const runSellerComplete = async () => {
    if (!hasChat) return;
    if (typeof window !== "undefined" && !window.confirm("이 구매자와 거래를 완료하고 상품을 판매완료로 표시할까요?")) {
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
      setActionBusy(null);
      setMenuOpen(false);
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
    <li className="relative rounded-ui-rect border border-gray-100 bg-white shadow-sm">
      <div className="flex gap-2 p-3">
        <Link href={`/post/${row.postId}`} className="flex min-w-0 flex-1 gap-3">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-ui-rect bg-gray-100">
            {row.thumbnail && !thumbFailed ? (
              <img
                src={row.thumbnail}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setThumbFailed(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-gray-400">이미지</div>
            )}
          </div>
          <div className="min-w-0 flex-1 pr-1">
            <p className="line-clamp-2 text-[14px] font-medium text-gray-900">{row.title || "상품"}</p>
            <p className="mt-0.5 text-[15px] font-bold text-gray-900">{formatPrice(row.price, currency)}</p>
            <p className="mt-0.5 truncate text-[12px] text-gray-600">
              {hasChat ? `구매자 ${row.buyerNickname}` : "아직 문의·채팅이 없어요"}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">거래 {formatTradeListDatetime(tradeAt)}</p>
            <p className="mt-0.5 text-[11px] text-gray-800">{tradeLine}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="rounded-ui-rect bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                상품 · {productBadge}
              </span>
              <span className="rounded-ui-rect bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-800">
                진행 · {tradeBadge}
              </span>
              <span
                className={`rounded-ui-rect px-1.5 py-0.5 text-[10px] font-medium ${
                  row.hasBuyerReview ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"
                }`}
              >
                {row.hasBuyerReview ? "구매자 후기 도착" : "구매자 후기 없음"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
              {hasChat ? (
                <span className="rounded-full border border-gray-200 bg-signature/5 px-2.5 py-1 font-medium text-gray-800">
                  이 거래는 채팅으로 다시 이어서 조율할 수 있어요
                </span>
              ) : (
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-500">
                  아직 연결된 거래 채팅이 없습니다
                </span>
              )}
            </div>
          </div>
        </Link>
        <div className="relative shrink-0 pt-0.5" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-ui-rect p-2 text-gray-500 hover:bg-gray-100"
            aria-label="더보기"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-9 z-[60] min-w-[200px] rounded-ui-rect border border-gray-200 bg-white py-1 shadow-lg">
              {hasChat ? (
                <Link
                  href={tradeHubChatRoomHref(row.chatId, "product_chat")}
                  onClick={() => setMenuOpen(false)}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-800 hover:bg-gray-50"
                >
                  채팅 보기
                </Link>
              ) : (
                <span className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-400">
                  채팅 없음 (상품에서 문의를 받으면 표시돼요)
                </span>
              )}
              {canListing ? (
                <>
                  <button
                    type="button"
                    disabled={!!actionBusy}
                    onClick={() => void persistListing("inquiry")}
                    className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {actionBusy === "listing" ? "저장 중…" : "판매중으로 변경"}
                  </button>
                  <button
                    type="button"
                    disabled={!!actionBusy}
                    onClick={() => void persistListing("negotiating")}
                    className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    문의중으로 변경
                  </button>
                  <button
                    type="button"
                    disabled={!!actionBusy}
                    onClick={() => void persistListing("reserved")}
                    className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    예약중으로 변경
                  </button>
                </>
              ) : null}
              {canSellerComplete ? (
                <button
                  type="button"
                  disabled={!!actionBusy}
                  onClick={() => void runSellerComplete()}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  {actionBusy === "complete" ? "처리 중…" : "거래완료 (되돌리기 불가)"}
                </button>
              ) : null}
              {canCancelSale ? (
                <button
                  type="button"
                  disabled={!!actionBusy}
                  onClick={() => void runCancelSale()}
                  className="block w-full border-t border-gray-100 px-4 py-2.5 text-left text-[14px] text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {actionBusy === "cancel" ? "처리 중…" : "물품 판매 취소"}
                </button>
              ) : null}
              {hasChat && row.hasBuyerReview ? (
                <button
                  type="button"
                  onClick={() => {
                    setReadBuyerReview(true);
                    setMenuOpen(false);
                  }}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-800 hover:bg-gray-50"
                >
                  구매자 후기 보기
                </button>
              ) : null}
              <Link
                href={`/post/${row.postId}`}
                onClick={() => setMenuOpen(false)}
                className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-800 hover:bg-gray-50"
              >
                게시글 보기
              </Link>
              {hasChat && row.buyerId ? (
                <button
                  type="button"
                  onClick={() => {
                    setReportOpen(true);
                    setMenuOpen(false);
                  }}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-gray-800 hover:bg-gray-50"
                >
                  신고·차단
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {hasChat ? (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2">
          <Link
            href={tradeHubChatRoomHref(row.chatId, "product_chat")}
            className="block w-full rounded-ui-rect border border-gray-200 bg-signature/5 py-2.5 text-center text-[13px] font-semibold text-gray-800"
          >
            관련 채팅으로 돌아가기
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
          <div className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-white">
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
