"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  tradeHubModeFromPathname,
  tradePurchaseDetailPath,
} from "@/lib/mypage/trade-hub-paths";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { formatPrice } from "@/lib/utils/format";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import {
  canShowPurchaseReviewSend,
  purchaseOverflowMenuKind,
  purchaseProductStatusBadge,
  purchaseReviewStatusBadge,
  purchaseTradeStatusBadge,
} from "@/lib/mypage/purchase-history-ui";
import { formatTradeListDatetime } from "@/lib/mypage/format-trade-datetime";
import { PurchaseReviewSheet } from "./PurchaseReviewSheet";
import { BuyerReviewReadSheet } from "./BuyerReviewReadSheet";

export interface PurchaseHistoryRow {
  chatId: string;
  postId: string;
  sellerId: string;
  sellerNickname: string;
  title: string;
  price: number;
  status: string;
  sellerListingState?: string;
  thumbnail: string;
  createdAt: string | null;
  lastMessageAt: string | null;
  tradeFlowStatus?: string;
  chatMode?: string;
  /** posts.sold_buyer_id — 탭 분류(거래완료 vs 거래완료 확인 대기)에 사용 */
  soldBuyerId?: string | null;
  sellerCompletedAt?: string | null;
  buyerConfirmedAt?: string | null;
  buyerConfirmSource?: string | null;
  hasBuyerReview: boolean;
}

export function PurchaseHistoryCard({
  row,
  viewerId,
  currency,
  onReload,
}: {
  row: PurchaseHistoryRow;
  viewerId: string;
  currency: string;
  onReload: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reviewSheet, setReviewSheet] = useState(false);
  const [readSheet, setReadSheet] = useState(false);
  const [report, setReport] = useState<{ open: boolean }>({ open: false });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname() ?? "";
  const purchaseDetailHref = tradePurchaseDetailPath(tradeHubModeFromPathname(pathname), row.chatId);

  const rowLike = {
    tradeFlowStatus: row.tradeFlowStatus,
    hasBuyerReview: row.hasBuyerReview,
    buyerConfirmSource: row.buyerConfirmSource,
  };
  const tradeBadge = purchaseTradeStatusBadge(rowLike);
  const reviewBadge = purchaseReviewStatusBadge(rowLike);
  const productBadge = purchaseProductStatusBadge(row.sellerListingState, row.status);
  const menuKind = purchaseOverflowMenuKind(rowLike);
  const showReviewSend = canShowPurchaseReviewSend(rowLike);
  const needsBuyerTradeConfirm = menuKind === "seller_done";
  const needsReviewCallToAction = menuKind === "need_review" && showReviewSend && !row.hasBuyerReview;

  const tradeAt =
    row.buyerConfirmedAt || row.sellerCompletedAt || row.createdAt || row.lastMessageAt;
  const tradeAtLabel = formatTradeListDatetime(tradeAt);

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

  const base = `/api/trade/product-chat/${encodeURIComponent(row.chatId)}`;

  const postTrade = (path: string) => {
    setActionLoading(path);
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && data.ok) {
          onReload();
          if (path.endsWith("/buyer-confirm")) {
            setReviewSheet(true);
          }
        }
      })
      .finally(() => {
        setActionLoading(null);
        setMenuOpen(false);
      });
  };

  return (
    <li className="relative rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
      <div
        className={`flex gap-2 p-3 ${needsBuyerTradeConfirm || needsReviewCallToAction ? "pb-2" : ""}`}
      >
        <Link href={purchaseDetailHref} className="flex min-w-0 flex-1 gap-3">
          <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
            {row.thumbnail && !thumbFailed ? (
              <img
                src={row.thumbnail}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setThumbFailed(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-sam-meta">이미지</div>
            )}
          </div>
          <div className="min-w-0 flex-1 pr-1">
            <p className="line-clamp-2 text-[14px] font-medium text-sam-fg">{row.title || "상품"}</p>
            <p className="mt-0.5 text-[15px] font-bold text-sam-fg">{formatPrice(row.price, currency)}</p>
            {row.sellerNickname ? (
              <p className="mt-0.5 truncate text-[12px] text-sam-muted">{row.sellerNickname}</p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-sam-meta">거래 {tradeAtLabel}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="rounded-ui-rect bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                상품 · {productBadge}
              </span>
              <span className="rounded-ui-rect bg-sam-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-sam-fg">
                진행 · {tradeBadge}
              </span>
              <span className="rounded-ui-rect bg-signature/5 px-1.5 py-0.5 text-[10px] font-medium text-sam-fg">
                후기 · {reviewBadge}
              </span>
            </div>
          </div>
        </Link>
        <div className="relative shrink-0 pt-0.5" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-ui-rect p-2 text-sam-muted hover:bg-sam-surface-muted"
            aria-label="더보기"
          >
            <DotsIcon />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-9 z-[60] min-w-[180px] rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-lg">
              <MenuLink
                href={tradeHubChatRoomHref(row.chatId, "product_chat")}
                onNavigate={() => setMenuOpen(false)}
              >
                채팅 보기
              </MenuLink>
              {menuKind === "seller_done" ? (
                <>
                  <MenuButton
                    disabled={!!actionLoading}
                    onClick={() => postTrade(`${base}/buyer-confirm`)}
                  >
                    {actionLoading?.endsWith("/buyer-confirm") ? "처리 중…" : "거래완료 확인"}
                  </MenuButton>
                  <MenuButton
                    disabled={!!actionLoading}
                    onClick={() => postTrade(`${base}/buyer-issue`)}
                  >
                    문제있어요
                  </MenuButton>
                </>
              ) : null}
              {menuKind === "need_review" && showReviewSend ? (
                <>
                  <MenuButton onClick={() => { setReviewSheet(true); setMenuOpen(false); }}>
                    평가·후기 보내기
                  </MenuButton>
                  <MenuLink
                    href={tradeHubChatRoomHref(row.chatId, "product_chat", { review: true })}
                    onNavigate={() => setMenuOpen(false)}
                  >
                    채팅 상단에서 평가·후기 보내기
                  </MenuLink>
                </>
              ) : null}
              {menuKind === "review_done" && row.hasBuyerReview ? (
                <MenuButton
                  onClick={() => {
                    setReadSheet(true);
                    setMenuOpen(false);
                  }}
                >
                  내가 남긴 후기 보기
                </MenuButton>
              ) : null}
              <MenuLink href={purchaseDetailHref} onNavigate={() => setMenuOpen(false)}>
                거래 상세 보기
              </MenuLink>
              <MenuButton
                onClick={() => {
                  setReport({ open: true });
                  setMenuOpen(false);
                }}
              >
                신고하기
              </MenuButton>
            </div>
          ) : null}
        </div>
      </div>

      {needsBuyerTradeConfirm ? (
        <div className="border-t border-sam-border-soft px-3 py-2.5">
          <button
            type="button"
            disabled={!!actionLoading}
            onClick={() => postTrade(`${base}/buyer-confirm`)}
            className="w-full rounded-ui-rect bg-signature py-2.5 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {actionLoading?.endsWith("/buyer-confirm") ? "처리 중…" : "거래완료 확인"}
          </button>
          <p className="mt-1.5 text-center text-[10px] text-sam-muted">
            문제가 있으면 ⋮ 메뉴에서 「문제있어요」를 눌러 주세요.
          </p>
        </div>
      ) : null}

      {needsReviewCallToAction ? (
        <div className="border-t border-sam-border-soft px-3 py-2.5">
          <p className="mb-2 text-center text-[11px] text-sam-fg">
            거래완료 확인이 끝났어요. 이제 <strong className="font-semibold">평가·후기</strong>를 남겨 주세요.
          </p>
          <button
            type="button"
            onClick={() => setReviewSheet(true)}
            className="w-full rounded-ui-rect bg-signature py-2.5 text-[13px] font-medium text-white"
          >
            평가·후기 보내기
          </button>
        </div>
      ) : null}

      {reviewSheet ? (
        <PurchaseReviewSheet
          chatId={row.chatId}
          postId={row.postId}
          sellerId={row.sellerId}
          sellerNickname={row.sellerNickname || "판매자"}
          productTitle={row.title}
          thumbnail={row.thumbnail}
          onClose={() => setReviewSheet(false)}
          onSuccess={() => {
            setReviewSheet(false);
            onReload();
          }}
        />
      ) : null}

      {readSheet ? (
        <BuyerReviewReadSheet
          chatId={row.chatId}
          perspective="buyer_self"
          onClose={() => setReadSheet(false)}
        />
      ) : null}

      {report.open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface">
            <ReportActionSheet
              targetType="user"
              targetId={row.sellerId}
              targetUserId={row.sellerId}
              targetLabel={row.sellerNickname}
              roomId={row.chatId}
              productId={row.postId}
              onClose={() => setReport({ open: false })}
              onSuccess={() => setReport({ open: false })}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function MenuLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="block w-full px-4 py-2.5 text-left text-[14px] text-sam-fg hover:bg-sam-app"
    >
      {children}
    </Link>
  );
}

function MenuButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block w-full px-4 py-2.5 text-left text-[14px] text-sam-fg hover:bg-sam-app disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function DotsIcon() {
  return (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}
