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
import { SELLER_LISTING_LABEL, type SellerListingState } from "@/lib/products/seller-listing-state";

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
    [onRefresh]
  );

  const onHideListing = () =>
    wrap(async () => {
      if (!window.confirm(t("ui_post_hide_confirm"))) return false;
      const data = await postOwnerStatusHidden(postId);
      if (!data.ok) {
        window.alert(data.error ?? "숨김 처리에 실패했습니다.");
        return false;
      }
      return true;
    });

  const onDeletePost = () =>
    wrap(async () => {
      if (!window.confirm(t("ui_post_delete_confirm_list"))) return false;
      const data = await postOwnerDeleteRequest(postId);
      if (!data.ok) {
        window.alert(data.error ?? "삭제에 실패했습니다.");
        return false;
      }
      window.location.href = "/my/products";
      return true;
    });

  const transitionListing = (next: SellerListingState, reservedBuyerId?: string) =>
    wrap(async () => {
      const label = SELLER_LISTING_LABEL[next];
      if (!window.confirm(t("mypage_comp_product_listing_change_confirm", { label }))) return false;
      const data = await postSellerListingStateRequest(postId, next, reservedBuyerId);
      if (!data.ok) {
        window.alert(data.error ?? "저장에 실패했습니다.");
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
        const label = SELLER_LISTING_LABEL.reserved;
        if (!window.confirm(t("mypage_comp_product_listing_change_confirm", { label }))) return false;
        const saved = await postSellerListingStateRequest(postId, "reserved", candidates[0].buyerId);
        if (!saved.ok) {
          window.alert(saved.error ?? "저장에 실패했습니다.");
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
        !window.confirm(
          "거래완료하면 선택한 구매자에게 확인·후기 안내가 전달되고, 글이 판매완료로 표시됩니다. 진행할까요?"
        )
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
          window.alert(done.error ?? "거래완료 처리에 실패했습니다.");
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
          window.alert(done.error ?? "거래완료 처리에 실패했습니다.");
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
          window.alert(saved.error ?? "저장에 실패했습니다.");
          return;
        }
        if (saved.warning) window.alert(saved.warning);
      } else {
        const done = await postSellerCompleteRequest(c.chatId);
        if (!done.ok) {
          window.alert(done.error ?? "거래완료 처리에 실패했습니다.");
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
                수정
              </Link>
            ) : null}
            {canDelete ? (
              <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void onDeletePost()}>
                삭제
              </button>
            ) : null}
            <button
              type="button"
              className={BTN}
              disabled={busy}
              onClick={() => void transitionListing("negotiating")}
            >
              협의중
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void startReserveFlow()}>
              예약
            </button>
          </>
        )}
        <TradeBuyerPickerModal
          open={!!buyerPicker}
          title={buyerPicker?.mode === "reserve" ? "예약할 구매자 선택" : "거래완료할 구매자 선택"}
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
              거래중(예약)
            </button>
            <button
              type="button"
              className={BTN}
              disabled={busy}
              onClick={() => void transitionListing("inquiry")}
            >
              판매중 복귀
            </button>
            <button type="button" className={BTN} disabled={busy} onClick={() => void onHideListing()}>
              숨김
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
              거래완료
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
                    window.alert(data.error ?? "처리에 실패했습니다.");
                    return false;
                  }
                  return true;
                })
              }
            >
              거래취소
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
        숨김
      </button>
    );
  }

  if (lifecycle === "cancelled") {
    return row(
      <>
        {canEdit ? (
          <Link href={`/products/${encodeURIComponent(postId)}/edit`} className={BTN}>
            일부 수정
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
                window.alert(data.error ?? "처리에 실패했습니다.");
                return false;
              }
              return true;
            })
          }
        >
          판매중 복귀
        </button>
      </>
    );
  }

  return null;
}
