"use client";

import { useEffect, useState } from "react";
import type { ChatRoom, TradeFlowStatus } from "@/lib/types/chat";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { TradeSellerListingStepDiagram } from "@/components/trade/TradeSellerListingStepDiagram";

const DISMISS_KEY_PREFIX = "trade-flow-banner-dismiss-actions:";

interface TradeFlowBannerProps {
  room: ChatRoom;
  currentUserId: string;
  effectiveProductChatId: string;
  onActionDone: () => void;
  onOpenReview?: () => void;
  canOpenReviewSheet?: boolean;
  /** 상품 카드·배너와 동일한 판매 노출 상태 (낙관적 반영 포함) */
  displayListing: SellerListingState;
  onPersistListing: (next: SellerListingState) => Promise<void>;
  listingSaving: boolean;
  listingError: string | null;
  /** 성공했으나 DB 제한으로 부분 반영만 된 경우(amber) */
  listingNotice?: string | null;
  /** false면 판매중/문의중 등 단계 버튼 숨김(DB에 seller_listing_state 없을 때) */
  sellerListingControlsEnabled?: boolean;
}

export function TradeFlowBanner({
  room,
  currentUserId,
  effectiveProductChatId,
  onActionDone,
  onOpenReview,
  canOpenReviewSheet = false,
  displayListing,
  onPersistListing,
  listingSaving,
  listingError,
  listingNotice = null,
  sellerListingControlsEnabled = true,
}: TradeFlowBannerProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const dismissStorageKey = `${DISMISS_KEY_PREFIX}${effectiveProductChatId}`;
  const [actionsDismissed, setActionsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setActionsDismissed(sessionStorage.getItem(dismissStorageKey) === "1");
    } catch {
      setActionsDismissed(false);
    }
  }, [dismissStorageKey]);

  const flow = (room.tradeFlowStatus ?? "chatting") as TradeFlowStatus;
  const mode = room.chatMode ?? "open";
  const amSeller = room.sellerId === currentUserId;
  const amBuyer = room.buyerId === currentUserId;
  const soldToOther =
    room.product?.status === "sold" &&
    room.soldBuyerId &&
    amBuyer &&
    room.soldBuyerId !== currentUserId;

  const post = async (path: string, body: Record<string, unknown>) => {
    setLoading(path);
    setMsg(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMsg(data.error ?? "처리하지 못했습니다.");
        return;
      }
      onActionDone();
      if (path.includes("/buyer-confirm") && amBuyer && onOpenReview && canOpenReviewSheet) {
        onOpenReview();
      }
    } catch {
      setMsg("네트워크 오류입니다.");
    } finally {
      setLoading(null);
    }
  };

  const dismissBuyerActions = () => {
    try {
      sessionStorage.setItem(dismissStorageKey, "1");
    } catch {
      /* ignore */
    }
    setActionsDismissed(true);
  };

  const productStatus = room.product?.status ?? "";

  const base = `/api/trade/product-chat/${encodeURIComponent(effectiveProductChatId)}`;
  const postNotSold = (productStatus ?? "").toLowerCase() !== "sold";
  const showSellerListingActions =
    sellerListingControlsEnabled && amSeller && room.product && postNotSold && flow === "chatting";

  if (soldToOther) {
    return (
      <div className="border-b border-amber-100 bg-amber-50 px-3 py-2.5 sam-text-body-secondary text-amber-900">
        이미 다른 구매자와 거래가 완료된 상품입니다. 새 메시지는 제한될 수 있어요.
      </div>
    );
  }

  if (flow === "archived") {
    return (
      <div className="border-b border-sam-border bg-sam-surface-muted px-3 py-2.5 sam-text-body-secondary text-sam-fg">
        같은 상품의 다른 거래가 완료되어 이 채팅은 종료된 방입니다.
        {mode === "readonly" ? " 읽기 전용이에요." : null}
      </div>
    );
  }

  if (mode === "readonly") {
    return (
      <div className="border-b border-sam-border bg-sam-app px-3 py-2.5 sam-text-body-secondary text-sam-fg">
        이 채팅은 읽기 전용입니다. 추가 문의는 새 거래·고객센터를 이용해 주세요.
      </div>
    );
  }

  if (mode === "limited") {
    return (
      <div className="border-b border-sam-border bg-sam-app px-3 py-2.5 sam-text-body-secondary text-sam-fg">
        <p className="sam-text-xxs text-sam-fg">
          일정 기간이 지나면 일반 채팅이 제한될 수 있어요. 신고·차단은 메뉴(⋮)를 이용해 주세요.
        </p>
        {canOpenReviewSheet && onOpenReview ? (
          <button
            type="button"
            onClick={() => onOpenReview()}
            className="mt-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg"
          >
            후기 보내기
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-b border-sam-border-soft bg-signature/10 px-3 py-2.5">
      {room.product && postNotSold && flow === "chatting" ? (
        <TradeSellerListingStepDiagram
          listing={displayListing}
          interactive={showSellerListingActions}
          disabled={!!loading || listingSaving}
          onPickListing={(next) => void onPersistListing(next)}
          onCompleteTrade={() => void post(`${base}/seller-complete`, {})}
        />
      ) : null}

      {flow === "seller_marked_done" && amBuyer && !actionsDismissed && (
        <div className="mt-2 space-y-1.5">
          <p className="sam-text-helper text-sam-fg">
            판매자가 거래완료 처리했어요. 거래가 끝났다면 <strong className="font-semibold">거래완료 확인</strong>으로
            넘어간 뒤 평가·후기를 남겨 주세요.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!loading}
              onClick={() => post(`${base}/buyer-confirm`, {})}
              className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-medium text-white disabled:opacity-50"
            >
              {loading === `${base}/buyer-confirm` ? "처리 중…" : "거래완료 확인"}
            </button>
            <button
              type="button"
              disabled={!!loading}
              onClick={() => post(`${base}/buyer-issue`, {})}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg disabled:opacity-50"
            >
              문제있어요
            </button>
            <button
              type="button"
              onClick={dismissBuyerActions}
              className="rounded-ui-rect border border-transparent px-3 py-1.5 sam-text-helper font-medium text-signature underline-offset-2 hover:underline"
            >
              나중에
            </button>
          </div>
        </div>
      )}

      {flow === "seller_marked_done" && amBuyer && actionsDismissed && (
        <p className="mt-2 sam-text-xxs text-sam-fg">
          거래완료 확인·평가·후기는 새로고침하거나{" "}
          <span className="font-medium">내 정보 → 구매 내역</span>의 메뉴(⋮)에서 진행할 수 있어요.
        </p>
      )}

      {(flow === "buyer_confirmed" || flow === "review_pending" || flow === "review_completed") && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {amBuyer ? (
            <>
              <p className="sam-text-xxs text-sam-fg">
                {room.buyerReviewSubmitted
                  ? "평가·후기 작성이 완료되었어요."
                  : "거래완료 확인이 끝났어요. 평가·후기를 남겨보세요. 구매 내역 메뉴(⋮)의 「후기 보내기」에서도 할 수 있어요."}
              </p>
              {canOpenReviewSheet && onOpenReview && !room.buyerReviewSubmitted ? (
                <button
                  type="button"
                  onClick={() => onOpenReview()}
                  className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-medium text-white"
                >
                  평가·후기 보내기
                </button>
              ) : null}
            </>
          ) : (
            <p className="sam-text-xxs text-sam-fg">
              평가·후기는 구매자만 작성해요. 구매자가 남기면{" "}
              {room.buyerReviewSubmitted ? "거래 흐름이 모두 끝나요." : "이 단계가 마무리돼요."}
            </p>
          )}
        </div>
      )}

      {flow === "dispute" && (
        <p className="mt-2 sam-text-xxs text-amber-900">문제가 접수되어 운영팀이 확인 중이에요.</p>
      )}

      {listingNotice ? <p className="mt-1.5 sam-text-xxs text-amber-800">{listingNotice}</p> : null}
      {listingError ? <p className="mt-1.5 sam-text-xxs text-red-600">{listingError}</p> : null}
      {msg && <p className="mt-2 sam-text-helper text-red-600">{msg}</p>}
    </div>
  );
}
