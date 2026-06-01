"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatRoom, TradeFlowStatus } from "@/lib/types/chat";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { TradeSellerListingStepDiagram } from "@/components/trade/TradeSellerListingStepDiagram";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const DISMISS_KEY_PREFIX = "trade-flow-banner-dismiss-actions:";

function listingStepLabelKey(listing: SellerListingState): "trade_listing_step_inquiry" | "trade_listing_step_negotiating" | "trade_listing_step_reserved" | "trade_listing_step_completed" {
  switch (listing) {
    case "negotiating":
      return "trade_listing_step_negotiating";
    case "reserved":
      return "trade_listing_step_reserved";
    case "completed":
      return "trade_listing_step_completed";
    default:
      return "trade_listing_step_inquiry";
  }
}

interface TradeFlowBannerProps {
  room: ChatRoom;
  currentUserId: string;
  effectiveProductChatId: string;
  onActionDone: () => void;
  /** `seller-complete` 성공 직후 UI를 즉시 완료로 반영(Realtime 누락 대비) */
  onSellerCompleteOptimistic?: () => void;
  onOpenReview?: () => void;
  canOpenReviewSheet?: boolean;
  /** 상품 카드·배너와 동일한 판매 노출 상태 (낙관적 반영 포함) */
  displayListing: SellerListingState;
  onPersistListing: (next: SellerListingState) => Promise<void>;
  listingSaving: boolean;
  listingError: string | null;
  /** 성공했으나 DB 제한으로 부분 반영만 된 경우(amber) */
  listingNotice?: string | null;
  /** posts.status Realtime 까지 즉시 반영해 구매자/상대방 UI를 동일하게 맞춤 */
  productStatusOverride?: string | null;
  /** false면 판매중/문의중 등 단계 버튼 숨김(DB에 seller_listing_state 없을 때) */
  sellerListingControlsEnabled?: boolean;
  /** 모바일 키보드 시 단계 UI를 한 줄로 접었다가 펼침 */
  layoutVariant?: "default" | "keyboardCompact";
  /** 단계 다이어그램 펼침·접힘 — 타임라인 하단 앵커 */
  onDiagramExpandedChange?: (expanded: boolean) => void;
}

export function TradeFlowBanner({
  room,
  currentUserId,
  effectiveProductChatId,
  onActionDone,
  onSellerCompleteOptimistic,
  onOpenReview,
  canOpenReviewSheet = false,
  displayListing,
  onPersistListing,
  listingSaving,
  listingError,
  listingNotice = null,
  productStatusOverride = null,
  sellerListingControlsEnabled = true,
  layoutVariant = "default",
  onDiagramExpandedChange,
}: TradeFlowBannerProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [diagramExpanded, setDiagramExpanded] = useState(false);

  useEffect(() => {
    onDiagramExpandedChange?.(diagramExpanded);
  }, [diagramExpanded, onDiagramExpandedChange]);
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

  useEffect(() => {
    if (layoutVariant !== "keyboardCompact") setDiagramExpanded(false);
  }, [layoutVariant]);

  const compact = layoutVariant === "keyboardCompact";
  const compactPad = compact ? "py-1.5" : "py-2.5";

  const flow = (room.tradeFlowStatus ?? "chatting") as TradeFlowStatus;
  const mode = room.chatMode ?? "open";
  const amSeller = room.sellerId === currentUserId;
  const amBuyer = room.buyerId === currentUserId;
  const productStatus = (productStatusOverride ?? room.product?.status ?? "").trim();
  const soldToOther =
    productStatus === "sold" &&
    room.soldBuyerId &&
    amBuyer &&
    room.soldBuyerId !== currentUserId;

  const listingStepLabel = useMemo(
    () => t(listingStepLabelKey(displayListing)),
    [displayListing, t]
  );

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
        setMsg(data.error ?? t("trade_detail_action_failed"));
        return;
      }
      if (path.includes("/seller-complete")) {
        onSellerCompleteOptimistic?.();
      }
      onActionDone();
      if (path.includes("/buyer-confirm") && amBuyer && onOpenReview && canOpenReviewSheet) {
        onOpenReview();
      }
    } catch {
      setMsg(t("trade_review_form_network_error"));
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

  const base = `/api/trade/product-chat/${encodeURIComponent(effectiveProductChatId)}`;
  const postNotSold = (productStatus ?? "").toLowerCase() !== "sold";
  const showSellerListingActions =
    sellerListingControlsEnabled && amSeller && room.product && postNotSold && flow === "chatting";

  if (soldToOther) {
    return (
      <div
        className={`border-b border-sam-warning/20 bg-sam-warning-soft px-3 ${compactPad} sam-text-body-secondary text-sam-warning`}
      >
        {t("trade_flow_sold_to_other_limited")}
      </div>
    );
  }

  if (flow === "archived") {
    return (
      <div
        className={`border-b border-sam-border bg-sam-surface-muted px-3 ${compactPad} sam-text-body-secondary text-sam-fg`}
      >
        {t("trade_flow_archived_room")}
        {mode === "readonly" ? t("trade_flow_archived_readonly_suffix") : null}
      </div>
    );
  }

  /** 상품 거래방은 히스토리·단계 확인을 위해 다이어그램을 유지해야 하므로, 읽기 제한 배너만 단독으로 두지 않음 */
  if (mode === "readonly" && !room.product) {
    return (
      <div className={`border-b border-sam-border bg-sam-app px-3 ${compactPad} sam-text-body-secondary text-sam-fg`}>
        {t("trade_flow_readonly_no_product")}
      </div>
    );
  }

  if (mode === "limited" && !room.product) {
    return (
      <div className={`border-b border-sam-border bg-sam-app px-3 ${compactPad} sam-text-body-secondary text-sam-fg`}>
        <p className="sam-text-xxs text-sam-fg">{t("trade_flow_limited_hint")}</p>
        {canOpenReviewSheet && onOpenReview ? (
          <button
            type="button"
            onClick={() => onOpenReview()}
            className="mt-2 rounded-sam-sm border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg"
          >
            {t("nav_trade_review_send")}
          </button>
        ) : null}
      </div>
    );
  }

  const diagramCompactOneLine = Boolean(room.product && postNotSold && flow === "chatting" && compact && !diagramExpanded);

  return (
    <div className={`border-b border-sam-primary-border bg-sam-primary-soft px-3 ${compactPad}`}>
      {mode === "readonly" && room.product ? (
        <p className="mb-2 sam-text-xxs text-sam-fg">{t("trade_flow_readonly_with_history")}</p>
      ) : null}
      {mode === "limited" && room.product ? (
        <div className="mb-2 space-y-2">
          <p className="sam-text-xxs text-sam-fg">{t("trade_flow_limited_hint")}</p>
          {canOpenReviewSheet && onOpenReview ? (
            <button
              type="button"
              onClick={() => onOpenReview()}
              className="rounded-sam-sm border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg"
            >
              {t("nav_trade_review_send")}
            </button>
          ) : null}
        </div>
      ) : null}

      {room.product ? (
        diagramCompactOneLine ? (
          <div className="flex min-h-[40px] items-center justify-between gap-2">
            <p className="min-w-0 truncate sam-text-helper font-semibold text-sam-fg">
              {t("trade_flow_step_heading", { label: listingStepLabel })}
            </p>
            <button
              type="button"
              onClick={() => setDiagramExpanded(true)}
              className="shrink-0 rounded-sam-sm border border-sam-border bg-sam-surface px-2.5 py-1 sam-text-xxs font-semibold text-sam-fg active:opacity-90"
            >
              {t("trade_flow_expand")}
            </button>
          </div>
        ) : (
          <div className="min-w-0">
            <TradeSellerListingStepDiagram
              listing={displayListing}
              interactive={showSellerListingActions}
              disabled={!!loading || listingSaving}
              onPickListing={(next) => void onPersistListing(next)}
              onCompleteTrade={() => {
                if (typeof window !== "undefined") {
                  const ok = window.confirm(t("trade_flow_seller_complete_confirm"));
                  if (!ok) return;
                }
                void post(`${base}/seller-complete`, {});
              }}
            />
            {compact && diagramExpanded ? (
              <button
                type="button"
                onClick={() => setDiagramExpanded(false)}
                className="mt-1.5 w-full rounded-sam-sm border border-sam-border bg-sam-surface py-1.5 sam-text-xxs font-medium text-sam-muted active:opacity-90"
              >
                {t("trade_flow_collapse")}
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {flow === "seller_marked_done" && amBuyer && !actionsDismissed && (
        <div className="mt-2 space-y-1.5">
          <p className="sam-text-helper text-sam-fg">
            {t("trade_flow_buyer_seller_done_body", { confirmStep: t("trade_022") })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!loading}
              onClick={() => post(`${base}/buyer-confirm`, {})}
              className="rounded-sam-sm bg-sam-primary px-3 py-1.5 sam-text-helper font-medium text-white disabled:opacity-50"
            >
              {loading === `${base}/buyer-confirm` ? t("trade_flow_processing") : t("trade_022")}
            </button>
            <button
              type="button"
              disabled={!!loading}
              onClick={() => post(`${base}/buyer-issue`, {})}
              className="rounded-sam-sm border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper font-medium text-sam-fg disabled:opacity-50"
            >
              {t("trade_flow_buyer_issue")}
            </button>
            <button
              type="button"
              onClick={dismissBuyerActions}
              className="rounded-sam-sm border border-transparent px-3 py-1.5 sam-text-helper font-medium text-sam-primary underline-offset-2 hover:underline"
            >
              {t("trade_flow_later")}
            </button>
          </div>
        </div>
      )}

      {flow === "seller_marked_done" && amBuyer && actionsDismissed && (
        <p className="mt-2 sam-text-xxs text-sam-fg">
          {t("trade_flow_buyer_dismissed_hint", { menuPath: t("trade_052") })}
        </p>
      )}

      {(flow === "buyer_confirmed" || flow === "review_pending" || flow === "review_completed") && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {amBuyer ? (
            <>
              <p className="sam-text-xxs text-sam-fg">
                {room.buyerReviewSubmitted
                  ? t("trade_flow_review_done_buyer")
                  : t("trade_flow_review_pending_buyer")}
              </p>
              {canOpenReviewSheet && onOpenReview && !room.buyerReviewSubmitted ? (
                <button
                  type="button"
                  onClick={() => onOpenReview()}
                  className="rounded-sam-sm bg-sam-primary px-3 py-1.5 sam-text-helper font-medium text-white"
                >
                  {t("nav_trade_review_send")}
                </button>
              ) : null}
            </>
          ) : (
            <p className="sam-text-xxs text-sam-fg">
              {t("trade_flow_review_seller_intro", {
                suffix: room.buyerReviewSubmitted
                  ? t("trade_flow_review_seller_done")
                  : t("trade_flow_review_seller_pending"),
              })}
            </p>
          )}
        </div>
      )}

      {flow === "dispute" && (
        <p className="mt-2 sam-text-xxs text-sam-warning">{t("trade_061")}</p>
      )}

      {listingNotice ? <p className="mt-1.5 sam-text-xxs text-sam-warning">{listingNotice}</p> : null}
      {listingError ? <p className="mt-1.5 sam-text-xxs text-sam-danger">{listingError}</p> : null}
      {msg && <p className="mt-2 sam-text-helper text-sam-danger">{msg}</p>}
    </div>
  );
}
