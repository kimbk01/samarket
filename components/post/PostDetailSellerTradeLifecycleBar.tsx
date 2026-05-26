"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import {
  allowAnyPostUpdate,
  allowSoftDelete,
  deriveTradeLifecycleStatus,
  type TradeLifecycleStatus,
} from "@/lib/trade/trade-lifecycle-policy";
import { TradeBuyerPickerModal, type TradeBuyerPickCandidate } from "@/components/mypage/products/TradeBuyerPickerModal";
import {
  dedupeBuyerCandidates,
  fetchPostBuyerChats,
  isActiveTradeChat,
  postOwnerDeleteRequest,
  postOwnerStatusHidden,
  postSellerCompleteRequest,
  postSellerListingStateRequest,
  postTradeLifecycleRequest,
} from "@/lib/trade/seller-trade-flow-client";
import { isOfflineMockPostId } from "@/lib/posts/offline-mock-post-id";
import { sellerListingLabel } from "@/lib/mypage/seller-listing-i18n";
import type { SellerListingState } from "@/lib/products/seller-listing-state";

const BTN =
  "rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 sam-text-helper font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50";
const BTN_PRIMARY = "rounded-ui-rect bg-signature px-2.5 py-1.5 sam-text-helper font-medium text-white hover:opacity-90 disabled:opacity-50";
const BTN_DANGER = "rounded-ui-rect border border-red-200 bg-red-50 px-2.5 py-1.5 sam-text-helper font-medium text-red-700 hover:bg-red-100 disabled:opacity-50";

type Props = {
  postId: string;
  status: string;
  sellerListingState?: string | null;
  meta?: Record<string, unknown> | null;
  onRefresh: () => void;
};

export function PostDetailSellerTradeLifecycleBar({
  postId,
  status,
  sellerListingState,
  meta,
  onRefresh,
}: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [buyerPicker, setBuyerPicker] = useState<{
    mode: "reserve" | "complete";
    candidates: TradeBuyerPickCandidate[];
  } | null>(null);

  const lifecycle: TradeLifecycleStatus = deriveTradeLifecycleStatus({
    status,
    seller_listing_state: sellerListingState,
    meta: meta ?? null,
  });

  const canEdit = allowAnyPostUpdate(lifecycle);
  const canDelete = allowSoftDelete(lifecycle);

  const wrap = useCallback(
    async (fn: () => Promise<boolean | void>) => {
      setBusy(true);
      try {
        const ok = await fn();
        if (ok !== false) onRefresh();
      } catch {
        window.alert(t("mypage_comp_product_network_error_short"));
      } finally {
        setBusy(false);
      }
    },
    [onRefresh, t]
  );

  const onHideListing = () =>
    wrap(async () => {
      if (!window.confirm(t("ui_post_hide_confirm"))) return false;
      const data = await postOwnerStatusHidden(postId);
      if (!data.ok) {
        window.alert(data.error ?? t("trade_detail_hide_failed"));
        return false;
      }
      return true;
    });

  const onDeletePost = () =>
    wrap(async () => {
      if (!window.confirm(t("ui_post_delete_confirm_list"))) return false;
      const data = await postOwnerDeleteRequest(postId);
      if (!data.ok) {
        window.alert(data.error ?? t("trade_detail_delete_failed"));
        return false;
      }
      window.location.href = "/my/products";
      return true;
    });

  const transitionListing = (next: SellerListingState, reservedBuyerId?: string) =>
    wrap(async () => {
      const label = sellerListingLabel(t, next);
      if (!window.confirm(t("mypage_comp_product_listing_change_confirm", { label }))) return false;
      const data = await postSellerListingStateRequest(postId, next, reservedBuyerId);
      if (!data.ok) {
        window.alert(data.error ?? t("trade_detail_save_failed"));
        return false;
      }
      if (data.warning) window.alert(data.warning);
      return true;
    });

  const startReserveFlow = () =>
    wrap(async () => {
      if (isOfflineMockPostId(postId)) {
        window.alert(t("ui_post_preview_no_reserve"));
        return false;
      }
      const data = await fetchPostBuyerChats(postId);
      if (data.error) {
        window.alert(data.error);
        return false;
      }
      const items = (data.items ?? []).filter(isActiveTradeChat);
      const candidates = dedupeBuyerCandidates(items);
      if (candidates.length === 0) {
        window.alert(t("mypage_comp_product_reserve_inquiry_only"));
        return false;
      }
      if (candidates.length === 1) {
        const label = sellerListingLabel(t, "reserved");
        if (!window.confirm(t("mypage_comp_product_listing_change_confirm", { label }))) return false;
        const saved = await postSellerListingStateRequest(postId, "reserved", candidates[0].buyerId);
        if (!saved.ok) {
          window.alert(saved.error ?? t("trade_detail_save_failed"));
          return false;
        }
        if (saved.warning) window.alert(saved.warning);
        return true;
      }
      setBuyerPicker({ mode: "reserve", candidates });
      return false;
    });

  const startCompleteFlow = () =>
    wrap(async () => {
      if (
        !window.confirm(t("trade_detail_complete_confirm"))
      ) {
        return false;
      }
      if (isOfflineMockPostId(postId)) {
        window.alert(t("ui_post_preview_no_complete"));
        return false;
      }
      const data = await fetchPostBuyerChats(postId);
      if (data.error) {
        window.alert(data.error);
        return false;
      }
      const items = (data.items ?? []).filter(isActiveTradeChat);
      const reservedId = data.reservedBuyerId?.trim() || "";
      const listingIsReserved =
        (data.sellerListingState ?? "").toLowerCase() === "reserved" || status === "reserved";

      if (listingIsReserved && reservedId) {
        const row = items.find((i) => i.buyerId === reservedId);
        if (!row?.chatId) {
          window.alert(t("mypage_comp_product_reserved_chat_missing"));
          return false;
        }
        const done = await postSellerCompleteRequest(row.chatId);
        if (!done.ok) {
          window.alert(done.error ?? t("trade_detail_complete_failed"));
          return false;
        }
        return true;
      }

      const candidates = dedupeBuyerCandidates(items);
      if (candidates.length === 0) {
        window.alert(t("mypage_comp_product_no_inquiry_for_complete"));
        return false;
      }
      if (candidates.length === 1) {
        const done = await postSellerCompleteRequest(candidates[0].chatId);
        if (!done.ok) {
          window.alert(done.error ?? t("trade_detail_complete_failed"));
          return false;
        }
        return true;
      }
      setBuyerPicker({ mode: "complete", candidates });
      return false;
    });

  const onBuyerPicked = async (c: TradeBuyerPickCandidate) => {
    if (!buyerPicker) return;
    const { mode } = buyerPicker;
    setBuyerPicker((prev) => (prev === null ? prev : null));
    setBusy((prev) => (prev ? prev : true));
    try {
      if (mode === "reserve") {
        const saved = await postSellerListingStateRequest(postId, "reserved", c.buyerId);
        if (!saved.ok) {
          window.alert(saved.error ?? t("trade_detail_save_failed"));
          return;
        }
        if (saved.warning) window.alert(saved.warning);
      } else {
        const done = await postSellerCompleteRequest(c.chatId);
        if (!done.ok) {
          window.alert(done.error ?? t("trade_detail_complete_failed"));
          return;
        }
      }
      onRefresh();
    } catch {
      window.alert(t("mypage_comp_product_network_error_short"));
    } finally {
      setBusy((prev) => (prev ? false : prev));
    }
  };

  if (lifecycle === "hidden") {
    return <p className="text-center sam-text-xxs text-sam-muted">{t("ui_post_hidden_listing")}</p>;
  }

  const row = (children: ReactNode) => (
    <div className="flex flex-wrap items-center justify-center gap-1.5">{children}</div>
  );

  if (lifecycle === "draft" || lifecycle === "active") {
    return (
      <>
        {row(
          <>
            {canEdit ? (
              <Link href={`/products/${encodeURIComponent(postId)}/edit`} className={BTN_PRIMARY}>
                {t("mypage_comp_product_edit")}
              </Link>
            ) : null}
            {canDelete ? (
              <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void onDeletePost()}>
                {t("trade_070")}
              </button>
            ) : null}
            <button
              type="button"
              className={BTN}
              disabled={busy}
              onClick={() => void transitionListing("negotiating")}
            >
              {sellerListingLabel(t, "negotiating")}
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void startReserveFlow()}>
              {t("trade_detail_btn_reserve")}
            </button>
          </>
        )}
        <TradeBuyerPickerModal
          open={!!buyerPicker}
          title={
            buyerPicker?.mode === "reserve"
              ? t("trade_detail_buyer_pick_reserve_title")
              : t("trade_detail_buyer_pick_complete_title")
          }
          subtitle={t("ui_post_buyer_picker_subtitle")}
          candidates={buyerPicker?.candidates ?? []}
          onClose={() => setBuyerPicker((prev) => (prev === null ? prev : null))}
          onSelect={onBuyerPicked}
        />
      </>
    );
  }

  if (lifecycle === "negotiating") {
    return (
      <>
        {row(
          <>
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void startReserveFlow()}>
              {t("trade_detail_btn_negotiating_reserve")}
            </button>
            <button
              type="button"
              className={BTN}
              disabled={busy}
              onClick={() => void transitionListing("inquiry")}
            >
              {t("mypage_comp_sales_to_inquiry")}
            </button>
            <button type="button" className={BTN} disabled={busy} onClick={() => void onHideListing()}>
              {t("mypage_comp_product_status_hidden")}
            </button>
          </>
        )}
        <TradeBuyerPickerModal
          open={!!buyerPicker}
          title={t("mypage_comp_product_pick_reserve_title")}
          subtitle={t("ui_post_buyer_picker_subtitle")}
          candidates={buyerPicker?.candidates ?? []}
          onClose={() => setBuyerPicker((prev) => (prev === null ? prev : null))}
          onSelect={onBuyerPicked}
        />
      </>
    );
  }

  if (lifecycle === "in_progress") {
    return (
      <>
        {row(
          <>
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void startCompleteFlow()}>
              {t("trade_detail_btn_complete")}
            </button>
            <button
              type="button"
              className={BTN_DANGER}
              disabled={busy}
              onClick={() =>
                void wrap(async () => {
                  if (!window.confirm(t("ui_post_cancel_trade_confirm"))) return false;
                  const data = await postTradeLifecycleRequest(postId, "cancel_trade");
                  if (!data.ok) {
                    window.alert(data.error ?? t("trade_detail_action_failed"));
                    return false;
                  }
                  return true;
                })
              }
            >
              {t("trade_detail_btn_cancel_trade")}
            </button>
          </>
        )}
        <TradeBuyerPickerModal
          open={!!buyerPicker && buyerPicker.mode === "complete"}
          title={t("mypage_comp_product_pick_complete_title")}
          subtitle={t("ui_post_buyer_picker_subtitle")}
          candidates={buyerPicker?.candidates ?? []}
          onClose={() => setBuyerPicker((prev) => (prev === null ? prev : null))}
          onSelect={onBuyerPicked}
        />
      </>
    );
  }

  if (lifecycle === "completed") {
    return row(
      <button type="button" className={BTN} disabled={busy} onClick={() => void onHideListing()}>
        {t("mypage_comp_product_status_hidden")}
      </button>
    );
  }

  if (lifecycle === "cancelled") {
    return row(
      <>
        {canEdit ? (
          <Link href={`/products/${encodeURIComponent(postId)}/edit`} className={BTN}>
            {t("trade_detail_btn_partial_edit")}
          </Link>
        ) : null}
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy}
          onClick={() =>
            void wrap(async () => {
              if (!window.confirm(t("ui_post_relist_confirm"))) return false;
              const data = await postTradeLifecycleRequest(postId, "resume_active");
              if (!data.ok) {
                window.alert(data.error ?? t("trade_detail_action_failed"));
                return false;
              }
              return true;
            })
          }
        >
          {t("mypage_comp_product_relist_active")}
        </button>
      </>
    );
  }

  return null;
}
