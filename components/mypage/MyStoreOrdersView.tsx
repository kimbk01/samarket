"use client";

import { buyerPaidAmountPhp } from "@/lib/stores/buyer-store-order-money";
import "@/app/store-order-list-tokens.css";
import { DibayActionSheet } from "@/components/ui/dibay-overlay";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import Link from "next/link";
import { ChevronDown, MoreHorizontal, Store } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MyStoreOrderExpandPanel,
  type BuyerStoreOrderExpandListSeed,
} from "@/components/mypage/MyStoreOrderExpandPanel";
import { BuyerStoreOrderCompletedReviewBlock } from "@/components/mypage/BuyerStoreOrderCompletedReviewBlock";
import { BuyerStoreOrderChatSlidePanel } from "@/components/mypage/BuyerStoreOrderChatSlidePanel";
import { BuyerStoreOrderReviewSlidePanel } from "@/components/mypage/BuyerStoreOrderReviewSlidePanel";
import { isStoreOrderBuyerHideAllowedStatus } from "@/lib/stores/store-order-process-model";
import { CommerceCartHubHeaderRight } from "@/components/layout/CommerceCartHubHeaderRight";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MemberOrderTabs } from "@/components/member-orders/MemberOrderTabs";
import type { MemberOrderTab } from "@/lib/member-orders/types";
import { countMemberOrderTabs, memberOrderStatusInTab } from "@/lib/member-orders/member-order-tab-status";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import { isStoreOrderChatDisabledForBuyer } from "@/lib/stores/order-status-transitions";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { resolveBodyBottomNavClearanceClass } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import type { CompletedOrderReorderPayload } from "@/lib/stores/apply-completed-order-to-commerce-cart";
import { StoreOrderReorderAgainButton } from "@/components/mypage/StoreOrderReorderAgainButton";
import type { BuyerStoreOrderReviewSummary } from "@/lib/stores/buyer-store-order-review-meta";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  buildMessengerContextInputFromStoreOrderSnapshot,
  buildMessengerContextMetaFromStoreOrder,
} from "@/lib/community-messenger/store-order-messenger-context";
import { buildStoreOrderMessengerRoomHref } from "@/lib/chats/surfaces/order-chat-surface";
import {
  deleteMeStoreOrder,
  fetchMeStoreOrdersListDeduped,
  patchMeStoreOrder,
  warmMeStoreOrderExpandDetail,
} from "@/lib/stores/store-delivery-api-client";
import { useSupabaseBuyerStoreOrdersRealtime } from "@/hooks/useSupabaseBuyerStoreOrdersRealtime";
import { formatStoreOrderCheckoutEtaSummary } from "@/lib/stores/format-store-order-checkout-display";
import { formatAppDateTime } from "@/lib/i18n/locale-for-app-language";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import {
  canonicalHubHref,
} from "@/lib/delivery/customer/commerce-hub-nav";
import {
  filterOrdersByHubFilter,
  type StoreOrdersHubFilter,
} from "@/lib/delivery/customer/store-orders-hub-filter";
import { MyListPager } from "@/components/mypage/ds/MyListPager";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import { useMypageListRestore } from "@/lib/mypage/use-mypage-list-restore";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import {
  MEMBER_ORDER_TAB_VALUES,
  resolveStoreOrderMutationErrorKey,
  resolveStoreOrdersLoadErrorKey,
} from "@/lib/mypage/my-store-orders-ui";
import {
  peekMypageListPageCache,
  writeMypageListPageCache,
} from "@/lib/mypage/mypage-list-scroll-restore";
import { OverlayScopeProvider } from "@/components/ui/dibay-overlay/overlay-scope";

/** 주문 내역 시트·다이얼로그(body 포털)도 목록과 같은 스코프 — `data-delivery-scope`·`data-store-orders-surface` */
const ORDERS_HUB_SCOPE = { "data-delivery-scope": "orders", "data-store-orders-surface": "delivery-hub" } as const;
const ORDERS_MYPAGE_SCOPE = { "data-delivery-scope": "orders", "data-store-orders-surface": "mypage" } as const;

type ItemRow = {
  id: string;
  product_id?: string;
  product_title_snapshot: string;
  price_snapshot?: number;
  qty: number;
  options_snapshot_json?: unknown;
};

type OrderRow = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  /** `GET /api/me/store-orders` — 매장 상세·장바구니 경로용 */
  store_slug?: string;
  total_amount: number;
  discount_amount?: number;
  gift_redemption_amount?: number;
  payment_amount: number;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note: string | null;
  created_at: string;
  auto_complete_at?: string | null;
  items?: ItemRow[];
  /** `GET /api/me/store-orders` — 완료·미작성·store_reviews 테이블 있을 때만 true */
  can_submit_review?: boolean;
  has_review?: boolean;
  review?: BuyerStoreOrderReviewSummary | null;
  review_status?: "not_applicable" | "pending" | "completed" | "unavailable" | string | null;
  /** 매장 프로필(채팅 목록 카드와 동일 톤의 썸네일) */
  store_profile_image_url?: string | null;
  order_chat_unread_count?: number;
  community_messenger_room_id?: string | null;
  checkout_eta_minutes?: number | null;
  checkout_route_distance_meters?: number | null;
};

function resolveBuyerStoreOrderChatHref(args: {
  order: OrderRow;
  ordersHubPaths: boolean;
  returnHref: string;
}): string {
  const contextPaymentAmount = buyerPaidAmountPhp(args.order);
  const roomId = args.order.community_messenger_room_id?.trim() ?? "";
  if (roomId) {
    return buildStoreOrderMessengerRoomHref(roomId, {
      contextMeta: buildMessengerContextMetaFromStoreOrder(
        buildMessengerContextInputFromStoreOrderSnapshot({
          orderId: args.order.id,
          storeName: args.order.store_name,
          orderNo: args.order.order_no,
          storeId: args.order.store_id,
          fulfillmentType: args.order.fulfillment_type,
          orderStatus: args.order.order_status,
          paymentAmount: contextPaymentAmount,
          firstLineProductTitle: args.order.items?.[0]?.product_title_snapshot ?? null,
          thumbnailUrl: args.order.store_profile_image_url ?? null,
        })
      ),
      entryOrigin: "delivery",
      returnHref: args.returnHref,
    });
  }
  return `/orders/store/${encodeURIComponent(args.order.id)}/chat`;
}

function filterByTab(rows: OrderRow[], tab: MemberOrderTab): OrderRow[] {
  return rows.filter((o) => memberOrderStatusInTab(o.order_status, tab));
}

function tabCounts(rows: OrderRow[]): Record<MemberOrderTab, number> {
  return countMemberOrderTabs(rows.map((o) => o.order_status));
}

function isDeliveryFulfillment(ft: string) {
  return ft === "local_delivery" || ft === "shipping";
}

/** 주문 상태 문구 SSOT = store-order-process-model (buyerOrderStatusLabel) — 상세·채팅과 같은 문구 (D9) */
function statusUserLine(status: string, lang: AppLanguageCode, fulfillment: string) {
  return buyerOrderStatusLabel(status, lang, fulfillment);
}

/** 상태 배지 색 — 문구는 프로세스 모델, 색은 진행/완료/요청/종료 4단계만 */
function orderStatusBadgeToneClass(status: string): string {
  const s = status.trim();
  if (s === "completed") return "bg-sam-success-soft text-sam-success";
  if (s === "cancel_requested" || s === "refund_requested") return "bg-sam-warning-soft text-sam-warning";
  if (s === "cancelled" || s === "refunded") return "bg-sam-surface-muted text-sam-muted";
  return "bg-sam-pressed-surface text-sam-primary";
}

function orderMenuSummaryLine(
  items: ItemRow[] | undefined,
  formatMore: (first: string, count: number) => string,
  fallback: string
): string {
  const rows = items ?? [];
  if (rows.length === 0) return fallback;
  const first = rows[0]!.product_title_snapshot?.trim() ?? "";
  if (!first) return fallback;
  const rest = rows.length - 1;
  return rest > 0 ? formatMore(first, rest) : first;
}

/**
 * 색 = `app/store-order-list-tokens.css` 의 `--sol-*` 토큰만 (X19·C5).
 * 내정보는 sam 토큰, 배달 허브(`data-store-orders-surface="delivery-hub"`)는 기존과 같은 값.
 */
const FB_MUTED = "text-[color:var(--sol-muted)]";
const FB_BODY = "text-[color:var(--sol-fg)]";
const FB_HOVER_ROW = "hover:bg-[color:var(--sol-action-hover)]";
const FB_DIVIDER = "border-[color:var(--sol-divider)]";

function FeedActionRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`flex min-h-[44px] divide-x divide-[color:var(--sol-divider-soft)] border-t ${FB_DIVIDER}`}
    >
      {children}
    </div>
  );
}

function toExpandListSeed(o: OrderRow): BuyerStoreOrderExpandListSeed {
  return {
    id: o.id,
    order_no: o.order_no,
    store_id: o.store_id,
    store_name: o.store_name,
    store_slug: o.store_slug,
    total_amount: o.total_amount,
    payment_amount: o.payment_amount,
    payment_status: o.payment_status,
    order_status: o.order_status,
    fulfillment_type: o.fulfillment_type,
    buyer_note: o.buyer_note,
    created_at: o.created_at,
    items: o.items,
  };
}

function reorderPayloadFromListOrder(o: OrderRow): CompletedOrderReorderPayload | null {
  if (o.order_status !== "completed") return null;
  const slug = String(o.store_slug ?? "").trim();
  if (!slug) return null;
  const items = (o.items ?? [])
    .map((it) => ({
      product_id: String((it as ItemRow).product_id ?? "").trim(),
      product_title_snapshot: it.product_title_snapshot,
      price_snapshot: Math.round(Number((it as ItemRow).price_snapshot) || 0),
      qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
      options_snapshot_json: (it as ItemRow).options_snapshot_json,
    }))
    .filter((it) => it.product_id.length > 0);
  if (!items.length) return null;
  return {
    storeId: o.store_id,
    storeSlug: slug,
    storeName: o.store_name,
    fulfillmentType: o.fulfillment_type,
    items,
  };
}

function MyStoreOrderCard({
  order: o,
  detailHref,
  chatHref,
  chatDisabled,
  orderChatUnread,
  onCancelPending,
  cancelBusy,
  allowDelete,
  onDelete,
  deleteBusy,
  cardVariant = "default",
  expandMode = false,
  expanded = false,
  onToggleExpand,
  onOpenChat,
  onOpenReview,
  ordersListHref = "/orders",
  onExpandPanelMutated,
  onPrefetchExpand,
  onNotify,
}: {
  order: OrderRow;
  detailHref: string;
  chatHref: string;
  chatDisabled: boolean;
  /** 주문 채팅 미읽음 — 배달/포장 뱃지 우측 상단 표시 */
  orderChatUnread: number;
  onCancelPending?: (id: string) => void;
  cancelBusy?: boolean;
  allowDelete?: boolean;
  onDelete?: (id: string) => void;
  deleteBusy?: boolean;
  cardVariant?: "default" | "deliveryHub";
  /** `/orders` 허브 — 카드 내 펼침 상세 */
  expandMode?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** `/orders` 허브 — 슬라이드 채팅 (펼침 접고 우→좌 패널) */
  onOpenChat?: () => void;
  /** `/orders` 허브 — 슬라이드 리뷰 작성 */
  onOpenReview?: () => void;
  ordersListHref?: string;
  onExpandPanelMutated?: () => void;
  /** 펼침 전 상세·이벤트 선로드 */
  onPrefetchExpand?: () => void;
  /** 펼침 패널 결과 알림 — 목록 `notify` 와 같은 경로 (FLW-07) */
  onNotify?: (message: string, tone: "success" | "error") => void;
}) {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const reorderPayload = reorderPayloadFromListOrder(o);
  const onChatPointerEnter = useCallback(() => {
    router.prefetch(chatHref);
  }, [chatHref, router]);
  const onExpandPointerEnter = useCallback(() => {
    onPrefetchExpand?.();
  }, [onPrefetchExpand]);
  const canCancelHere = o.order_status === "pending";
  const delivery = isDeliveryFulfillment(o.fulfillment_type);

  const storeImg = o.store_profile_image_url?.trim() || "";
  const relTime = formatRelativeTimeAgo(o.created_at, language);
  const menuSummary = orderMenuSummaryLine(
    o.items,
    (first, count) => t("member_order_items_more", { first, count }),
    statusUserLine(o.order_status, language, o.fulfillment_type)
  );
  const actionCell = `flex min-h-[44px] min-w-0 flex-1 items-center justify-center px-1 text-center sam-text-body-secondary font-semibold transition-colors sm:text-sm ${FB_BODY} ${FB_HOVER_ROW}`;
  const actionCellSignature = `flex min-h-[44px] min-w-0 flex-1 items-center justify-center px-1 text-center sam-text-body-secondary font-semibold transition-colors sm:text-sm text-signature ${FB_HOVER_ROW}`;
  const storeHref = o.store_slug?.trim()
    ? `/stores/${encodeURIComponent(o.store_slug.trim())}`
    : null;
  // Customer-facing amount only (same as the detail 총액) — never store revenue / coupon funding.
  const displayOrderAmount = buyerPaidAmountPhp(o);

  const summaryInner = (
    <div className="flex items-start justify-between gap-3">
      <p className={`min-w-0 flex-1 truncate sam-text-body font-semibold ${FB_BODY}`}>{menuSummary}</p>
      <span className={`shrink-0 sam-text-body font-semibold tabular-nums sm:text-base ${FB_BODY}`}>
        {formatMoneyPhp(displayOrderAmount)}
      </span>
    </div>
  );

  const reviewHref = `/orders/store/${encodeURIComponent(o.id)}/review`;
  const storeReviewsHref = o.store_slug?.trim()
    ? `/stores/${encodeURIComponent(o.store_slug.trim())}/reviews`
    : null;

  return (
    <article
      className={
        cardVariant === "deliveryHub"
          ? "relative overflow-hidden rounded-ui-rect border border-[color:var(--sol-card-border)] bg-[color:var(--sol-card-bg)] shadow-none"
          : "relative overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-[var(--sam-shadow-card)]"
      }
    >
      <div className="px-3 pb-2 pt-3 sm:px-4">
        <div className="flex gap-2.5">
          {storeHref ? (
            <Link href={storeHref} className="shrink-0">
              <SamarketThumbnail
                src={storeImg}
                alt={o.store_name || safeT("mypage_comp_store_fallback_name")}
                size={40}
                roundedClassName="rounded-full"
                className="bg-[color:var(--sol-thumb-bg)]"
                fallbackSrc=""
                fallbackNode={
                  <div className={`sam-text-xxs font-semibold ${FB_MUTED}`}>
                    {safeT("mypage_comp_store_fallback_name")}
                  </div>
                }
              />
            </Link>
          ) : (
            <SamarketThumbnail
              src={storeImg}
              alt={o.store_name || safeT("mypage_comp_store_fallback_name")}
              size={40}
              roundedClassName="rounded-full"
              className="bg-[color:var(--sol-thumb-bg)]"
              fallbackSrc=""
              fallbackNode={
                <div className={`sam-text-xxs font-semibold ${FB_MUTED}`}>
                  {safeT("mypage_comp_store_fallback_name")}
                </div>
              }
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                {storeHref ? (
                  <Link
                    href={storeHref}
                    className={`block truncate sam-text-body font-semibold leading-snug text-signature hover:underline ${FB_BODY}`}
                  >
                    {o.store_name || safeT("mypage_comp_store_fallback_name")}
                  </Link>
                ) : (
                  <p className={`truncate sam-text-body font-semibold leading-snug ${FB_BODY}`}>
                    {o.store_name || safeT("mypage_comp_store_fallback_name")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
                <span
                  className={`inline-flex max-w-[7rem] shrink-0 truncate rounded-full px-2 py-0.5 sam-text-xxs font-bold ${orderStatusBadgeToneClass(o.order_status)}`}
                  data-order-status={o.order_status}
                >
                  {buyerOrderStatusLabel(o.order_status, language, o.fulfillment_type)}
                </span>
                <span
                  className={`shrink-0 whitespace-nowrap rounded-ui-rect px-2 py-0.5 sam-text-xxs font-bold ${
                    delivery
                      ? "bg-[color:var(--sol-info-bg)] text-[color:var(--sol-info-fg)]"
                      : "bg-[color:var(--sol-pickup-bg)] text-[color:var(--sol-pickup-fg)]"
                  }`}
                >
                  {delivery ? safeT("common_delivery_label") : safeT("member_order_pickup_short")}
                </span>
                {orderChatUnread > 0 ? (
                  /* 채팅 미읽음 — 칩 위에 겹치지 않도록 흐름 안에 둔다 */
                  <span
                    className="pointer-events-none flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[color:var(--sol-danger)] px-1 sam-text-xxs font-bold leading-none text-[color:var(--sol-on-accent)]"
                    aria-label={t("mypage_comp_order_chat_unread_aria", {
                      count: orderChatUnread > 99 ? "99+" : orderChatUnread,
                    })}
                  >
                    {orderChatUnread > 99 ? "99+" : orderChatUnread}
                  </span>
                ) : null}
                {/* FLW-03 — 숨기기(⋯)는 종료 주문(완료·취소·환불 완료)만 */}
                {allowDelete && onDelete && isStoreOrderBuyerHideAllowedStatus(o.order_status) ? (
                  <button
                    type="button"
                    onClick={() => onDelete(o.id)}
                    disabled={deleteBusy}
                    data-store-order-more="1"
                    /* 44px 터치 영역은 유지, 줄 높이는 칩 기준(-my-2.5) — 아래 시간·주문번호 줄과 간격 고정 */
                    className={`-my-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${FB_MUTED} transition-colors ${FB_HOVER_ROW} disabled:opacity-50`}
                    aria-label={t("mypage_oa_order_more_aria")}
                    title={t("mypage_comp_orders_list_delete_title")}
                  >
                    {deleteBusy ? (
                      <span
                        aria-hidden
                        className="inline-block h-4 w-4 rounded-full border-2 border-sam-border border-t-sam-primary motion-safe:animate-spin"
                      />
                    ) : (
                      <MoreHorizontal className="h-5 w-5" aria-hidden />
                    )}
                  </button>
                ) : null}
              </div>
            </div>

            {/* 시간·주문번호 — 칩 묶음 아래 전체 폭 한 줄(줄바꿈 없이 말줄임) */}
            <p className={`mt-0.5 flex min-w-0 items-baseline sam-text-body-secondary leading-snug ${FB_MUTED}`}>
              <span className="shrink-0 whitespace-nowrap">{relTime}</span>
              <span className="mx-1 shrink-0 text-[color:var(--sol-separator)]" aria-hidden>
                ·
              </span>
              <span className="min-w-0 truncate font-mono sam-text-helper" title={o.order_no}>
                {o.order_no}
              </span>
            </p>
            {o.buyer_note?.trim() ? (
              <p className={`mt-1.5 sam-text-body-secondary font-medium text-[color:var(--sol-note-fg)]`}>
                {safeT("mypage_comp_buyer_note_present")}
              </p>
            ) : null}

            <div className={`mt-3 border-t ${FB_DIVIDER} pt-3`}>
              {expandMode && onToggleExpand ? (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  onPointerEnter={onExpandPointerEnter}
                  onFocus={onExpandPointerEnter}
                  className="block w-full rounded-ui-rect text-left transition-colors hover:bg-[color:var(--sol-row-hover)]"
                  aria-expanded={expanded}
                >
                  {summaryInner}
                </button>
              ) : (
                <Link href={detailHref} className="block rounded-ui-rect transition-colors hover:bg-[color:var(--sol-row-hover)]">
                  {summaryInner}
                </Link>
              )}
              {delivery
                ? (() => {
                    const line = formatStoreOrderCheckoutEtaSummary({
                      checkout_eta_minutes: o.checkout_eta_minutes,
                      checkout_route_distance_meters: o.checkout_route_distance_meters,
                    });
                    return line ?
                        <p className={`mt-2 sam-text-body-secondary leading-snug sm:text-sm ${FB_MUTED}`}>
                          {line}
                        </p>
                      : null;
                  })()
                : null}
              {(o.order_status === "ready_for_pickup" ||
                o.order_status === "delivering" ||
                o.order_status === "arrived") &&
              o.auto_complete_at ? (
                <p className={`mt-2 sam-text-body-secondary leading-snug ${FB_MUTED}`}>
                  {t("my_store_orders_auto_complete")}{" "}
                  <span className={`font-semibold ${FB_BODY}`}>
                    {formatAppDateTime(o.auto_complete_at, language)}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {expandMode && o.order_status === "completed" ? (
        <div className="px-3 pb-2 sm:px-4">
          <BuyerStoreOrderCompletedReviewBlock
            variant="list"
            listHref={ordersListHref}
            reviewHref={reviewHref}
            storeReviewsHref={storeReviewsHref}
            review={o.review ?? null}
            canSubmitReview={!!o.can_submit_review}
            reviewStatus={
              o.review || o.has_review
                ? "completed"
                : o.can_submit_review
                  ? "pending"
                  : (o.review_status ?? "unavailable")
            }
            chatHref={chatHref}
            orderChatDisabled={chatDisabled}
            hideNavigationActions
            onWriteReview={onOpenReview}
          />
        </div>
      ) : null}

      {o.order_status === "completed" && reorderPayload ? (
        <FeedActionRow>
          <StoreOrderReorderAgainButton
            payload={reorderPayload}
            className={`${actionCellSignature} min-w-0 border-0 bg-transparent`}
          />
        </FeedActionRow>
      ) : null}

      <FeedActionRow>
        {expandMode && onToggleExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            onPointerEnter={onExpandPointerEnter}
            onFocus={onExpandPointerEnter}
            className={`${actionCell} flex-col gap-0.5 py-2`}
            aria-expanded={expanded}
          >
            <span>{t("store_order_view_detail_btn")}</span>
            <ChevronDown
              className={`h-4 w-4 text-signature transition-transform duration-200 ${
                expanded ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </button>
        ) : (
          <Link href={detailHref} className={actionCell}>
            {t("store_owner_view_detail")}
          </Link>
        )}
        {chatDisabled ? (
          <span
            className={`flex min-h-[44px] min-w-0 flex-1 cursor-not-allowed items-center justify-center px-1 text-center sam-text-body-secondary font-medium text-[color:var(--sol-disabled)] sm:text-sm`}
          >
            {t("store_messenger_order_chat_label")}
          </span>
        ) : expandMode && onOpenChat ? (
          <Link href={chatHref} className={actionCellSignature} data-order-chat-expand-link="1">
            {t("store_messenger_order_chat_label")}
          </Link>
        ) : (
          <Link
            href={chatHref}
            className={actionCellSignature}
            onMouseEnter={onChatPointerEnter}
            onFocus={onChatPointerEnter}
          >
            {t("store_messenger_order_chat_label")}
          </Link>
        )}
      </FeedActionRow>

      {expandMode && expanded ? (
        <MyStoreOrderExpandPanel
          orderId={o.id}
          listSeed={toExpandListSeed(o)}
          onOrderMutated={onExpandPanelMutated}
          onRequestCancel={onCancelPending ? () => onCancelPending(o.id) : undefined}
          cancelBusy={cancelBusy}
          onNotify={onNotify}
        />
      ) : null}

      {canCancelHere && onCancelPending && !(expandMode && expanded) ? (
        <button
          type="button"
          disabled={cancelBusy}
          onClick={() => onCancelPending(o.id)}
          className={`w-full border-t ${FB_DIVIDER} py-2.5 text-center sam-text-body font-semibold text-[color:var(--sol-danger)] transition-colors ${FB_HOVER_ROW} disabled:opacity-50`}
        >
          {cancelBusy ? t("mypage_comp_processing") : t("mypage_comp_cancel_order")}
        </button>
      ) : null}
    </article>
  );
}

/** 내정보 주문 목록 재진입 캐시 — 뒤로 복귀 시 스켈레톤 없이 즉시 렌더 후 조용히 갱신 (§1.4·§1.7) */
const MYPAGE_STORE_ORDERS_CACHE_KEY = "mypage:store-orders:list";
type OrdersOkState = { kind: "ok"; orders: OrderRow[]; nextCursor: string | null; extraPages: boolean };

/**
 * S30 스켈레톤 — 탭 + 주문 카드 3개(40 원형 매장 사진 + 매장명·메뉴 2줄 + 우측 금액 + 하단 액션 셀 3칸).
 * `/mypage/store-orders` 페이지 Suspense 대체 화면도 같은 컴포넌트(스켈레톤 모양 1개 — 전환 시 구조 튐 없음).
 */
export function StoreOrdersListSkeleton({ showTabs }: { showTabs: boolean }) {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <div aria-busy="true" data-testid="store-orders-skeleton" className="flex flex-col gap-3">
      {showTabs ? (
        <div className="flex gap-4 border-b border-sam-border-soft px-1 pb-2 pt-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-4 w-12 ${bone}`} />
          ))}
        </div>
      ) : null}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          data-skeleton-row=""
          className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface"
        >
          <div className="flex gap-2.5 px-3 pb-2 pt-3 sm:px-4">
            <span className="h-10 w-10 shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className={`h-3.5 w-[45%] ${bone}`} />
              <span className={`h-3 w-[70%] ${bone}`} />
            </span>
            <span className={`h-3.5 w-14 shrink-0 ${bone}`} />
          </div>
          <div className="flex min-h-[44px] divide-x divide-sam-border-soft border-t border-sam-border-soft">
            {[0, 1, 2].map((c) => (
              <span key={c} className="flex flex-1 items-center justify-center">
                <span className={`h-3 w-12 ${bone}`} />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MyStoreOrdersView({
  embedded = false,
  suppressTier1Sync = false,
  variant = "default",
  initialExpandOrderId = null,
  hubOrderFilter = "all",
}: {
  embedded?: boolean;
  suppressTier1Sync?: boolean;
  /** `/orders` 배달 허브 — 오너 주문 UI 톤, 상태 탭·채팅 중복 없음 */
  variant?: "default" | "deliveryHub";
  /** `/orders?expand=` 딥링크 — 해당 주문 카드 자동 펼침 */
  initialExpandOrderId?: string | null;
  /** Hub orders tab status filter from URL `orderFilter` */
  hubOrderFilter?: StoreOrdersHubFilter;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const isDeliveryHub = variant === "deliveryHub";
  /** `/orders` 는 탭 숨김 — 탭 여백 대신 safe 1회; 탭이 보이는 경로는 셸/허브 계약 (H-02) */
  const pathname = usePathname();
  const navOccupiesClearance = useBottomNavOccupiesClearance();
  const deliveryHubBodyBottomClass = resolveBodyBottomNavClearanceClass(pathname, navOccupiesClearance);
  const ordersHubPaths = embedded || isDeliveryHub;
  /** 내정보 단독 화면(`/mypage/store-orders`) — `?tab=`·공통 상태 부품·내정보 토스트 적용 */
  const isMypageScreen = !ordersHubPaths;
  const ordersListHref = ordersHubPaths ? canonicalHubHref("orders") : "/mypage/store-orders";
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(
    initialExpandOrderId?.trim() || null
  );
  const expandScrollRef = useRef<string | null>(null);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null);
  /**
   * 탭 `?tab=` (S30 · §1.4) — 내정보 단독 화면만 URL 에 쓴다. 임베드(레거시 내정보 탭)는 부모의 `?tab=` 를
   * 덮지 않도록 로컬 상태, 배달 허브는 `orderFilter` 쿼리를 쓰므로 탭 미사용.
   */
  const [urlTab, setUrlTab] = useMypageTabParam<MemberOrderTab>({
    values: MEMBER_ORDER_TAB_VALUES,
    defaultValue: "all",
    key: isMypageScreen ? "tab" : "storeOrdersTab",
  });
  const [localTab, setLocalTab] = useState<MemberOrderTab>("all");
  const tab = isMypageScreen ? urlTab : localTab;
  const setTab = isMypageScreen ? setUrlTab : setLocalTab;
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionSheetOrderId, setActionSheetOrderId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "cancel" | "hide"; orderId: string } | null>(null);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unauth" }
    | { kind: "error"; message: string }
    | OrdersOkState
  >(() =>
    isMypageScreen
      ? (peekMypageListPageCache<OrdersOkState>(MYPAGE_STORE_ORDERS_CACHE_KEY) ?? { kind: "loading" })
      : { kind: "loading" }
  );
  const [moreBusy, setMoreBusy] = useState(false);
  /** 주문이 한 페이지(100건)를 넘을 때만 서버 전체 기준 탭 개수 */
  const [serverTabCounts, setServerTabCounts] = useState<Record<MemberOrderTab, number> | null>(null);
  const [moreError, setMoreError] = useState(false);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (isMypageScreen && state.kind === "ok") writeMypageListPageCache(MYPAGE_STORE_ORDERS_CACHE_KEY, state);
  }, [isMypageScreen, state]);

  /** 결과 알림 — 내정보 화면은 공통 토스트, 배달 허브·임베드는 기존 인라인 토스트 */
  const notify = useCallback(
    (message: string, tone: "success" | "error") => {
      if (isMypageScreen) {
        showMypageToast(message, tone);
        return;
      }
      setToast(message);
      setTimeout(() => setToast(null), tone === "error" ? 3200 : 2600);
    },
    [isMypageScreen]
  );

  const load = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      // 캐시로 이미 그린 목록이 있으면 스켈레톤으로 비우지 않고 조용히 갱신
      const silent = opts?.silent === true || stateRef.current.kind === "ok";
      const force = opts?.force === true;
      if (!silent) setState({ kind: "loading" });
      try {
        const { status, json } = await fetchMeStoreOrdersListDeduped(force ? "?fresh=1" : "");
        if (status === 401) {
          if (!silent) setState({ kind: "unauth" });
          return;
        }
        if (status === 503) {
          if (!silent) {
            setState({
              kind: "error",
              message: "supabase_unconfigured",
            });
          }
          return;
        }
        const data = json as { ok?: boolean; error?: string; orders?: unknown };
        if (!data?.ok) {
          if (!silent) {
            setState({
              kind: "error",
              message: typeof data?.error === "string" ? data.error : "load_failed",
            });
          }
          return;
        }
        const firstPage = (data.orders ?? []) as OrderRow[];
        const firstCursor = typeof (data as { next_cursor?: unknown }).next_cursor === "string"
          ? ((data as { next_cursor: string }).next_cursor)
          : null;
        setState((prev) => {
          // 조용한 새로고침(실시간·복귀) 때 이미 더 불러온 주문은 유지 — 첫 페이지만 최신으로 교체
          if (silent && prev.kind === "ok" && prev.extraPages) {
            const ids = new Set(firstPage.map((o) => o.id));
            return {
              kind: "ok",
              orders: [...firstPage, ...prev.orders.filter((o) => !ids.has(o.id))],
              nextCursor: prev.nextCursor,
              extraPages: true,
            };
          }
          return { kind: "ok", orders: firstPage, nextCursor: firstCursor, extraPages: false };
        });
        if (firstCursor) {
          void fetch("/api/me/store-orders?tab_counts=1", { credentials: "include", cache: "no-store" })
            .then((r) => r.json())
            .then((j: { ok?: boolean; tab_counts?: Record<MemberOrderTab, number> }) => {
              if (j?.ok && j.tab_counts) setServerTabCounts(j.tab_counts);
            })
            .catch(() => {});
        } else {
          setServerTabCounts(null);
        }
      } catch {
        if (!silent) setState({ kind: "error", message: "network_error" });
      }
    },
    []
  );

  /** 더 보기 — 주문이 100건을 넘는 회원 (v2.1 커서 페이지네이션) */
  const loadMore = useCallback(async () => {
    if (state.kind !== "ok" || !state.nextCursor || moreBusy) return;
    const cursor = state.nextCursor;
    setMoreBusy(true);
    setMoreError(false);
    try {
      const res = await fetch(`/api/me/store-orders?cursor=${encodeURIComponent(cursor)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; orders?: unknown; next_cursor?: unknown };
      if (!res.ok || !json.ok) throw new Error("load_more_failed");
      const page = (json.orders ?? []) as OrderRow[];
      const next = typeof json.next_cursor === "string" ? json.next_cursor : null;
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        const ids = new Set(prev.orders.map((o) => o.id));
        return {
          kind: "ok",
          orders: [...prev.orders, ...page.filter((o) => !ids.has(o.id))],
          nextCursor: next,
          extraPages: true,
        };
      });
    } catch {
      setMoreError(true);
    } finally {
      setMoreBusy(false);
    }
  }, [state, moreBusy]);

  useSupabaseBuyerStoreOrdersRealtime({
    debounceMs: 400,
    onChange: () => void load({ silent: true, force: true }),
  });

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => {
    void load({ silent: true });
  });

  /** 상세 갔다 뒤로 → 탭(URL)·스크롤·불러온 페이지 유지 (§1.4) — 내정보 화면만 */
  useMypageListRestore({
    ready: isMypageScreen && state.kind === "ok",
    loadedPages: state.kind === "ok" && state.extraPages ? 2 : 1,
  });

  useEffect(() => {
    if (!isDeliveryHub) return;
    const fromUrl = searchParams?.get("expand")?.trim() || null;
    setExpandedOrderId((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams, isDeliveryHub]);

  useEffect(() => {
    if (!isDeliveryHub || !expandedOrderId) return;
    const fromUrl = searchParams?.get("expand")?.trim() ?? "";
    if (fromUrl !== expandedOrderId) return;
    if (expandScrollRef.current === expandedOrderId) return;
    expandScrollRef.current = expandedOrderId;
    requestAnimationFrame(() => {
      document.getElementById(`order-card-${expandedOrderId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, [expandedOrderId, isDeliveryHub, searchParams]);

  useEffect(() => {
    if (!isDeliveryHub) return;
    const warmId = expandedOrderId?.trim() || initialExpandOrderId?.trim() || "";
    if (warmId) warmMeStoreOrderExpandDetail(warmId);
  }, [expandedOrderId, initialExpandOrderId, isDeliveryHub]);

  const prefetchExpandDetail = useCallback((orderId: string) => {
    warmMeStoreOrderExpandDetail(orderId);
  }, []);

  const toggleExpandOrder = useCallback(
    (orderId: string) => {
      if (!isDeliveryHub) return;
      setChatOrderId(null);
      setReviewOrderId(null);
      setExpandedOrderId((prev) => {
        const next = prev === orderId ? null : orderId;
        if (next) warmMeStoreOrderExpandDetail(next);
        const url = next
          ? canonicalHubHref("orders", { expand: next, orderFilter: hubOrderFilter !== "all" ? hubOrderFilter : null })
          : canonicalHubHref("orders", { orderFilter: hubOrderFilter !== "all" ? hubOrderFilter : null });
        router.replace(url, { scroll: false });
        return next;
      });
    },
    [isDeliveryHub, router]
  );

  const openChatOrder = useCallback(
    (orderId: string) => {
      if (!isDeliveryHub) return;
      setExpandedOrderId(null);
      setReviewOrderId(null);
      router.replace(canonicalHubHref("orders", { orderFilter: hubOrderFilter !== "all" ? hubOrderFilter : null }), {
        scroll: false,
      });
      setChatOrderId(orderId);
    },
    [isDeliveryHub, router]
  );

  const closeChatOrder = useCallback(() => {
    setChatOrderId(null);
  }, []);

  const openReviewOrder = useCallback(
    (orderId: string) => {
      if (!isDeliveryHub) return;
      setExpandedOrderId(null);
      setChatOrderId(null);
      router.replace(canonicalHubHref("orders", { orderFilter: hubOrderFilter !== "all" ? hubOrderFilter : null }), {
        scroll: false,
      });
      setReviewOrderId(orderId);
    },
    [isDeliveryHub, router]
  );

  const closeReviewOrder = useCallback(() => {
    setReviewOrderId(null);
  }, []);

  const chatOrder = useMemo(() => {
    if (!chatOrderId || state.kind !== "ok") return null;
    return state.orders.find((row) => row.id === chatOrderId) ?? null;
  }, [chatOrderId, state]);

  const reviewOrder = useMemo(() => {
    if (!reviewOrderId || state.kind !== "ok") return null;
    return state.orders.find((row) => row.id === reviewOrderId) ?? null;
  }, [reviewOrderId, state]);

  useLayoutEffect(() => {
    if (ordersHubPaths) return;
    if (suppressTier1Sync) return;
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      tier1: {
        rightSlot: <CommerceCartHubHeaderRight />,
      },
    });
    return () => setMainTier1Extras(null);
  }, [ordersHubPaths, setMainTier1Extras, suppressTier1Sync]);

  const allSorted = useMemo(() => {
    if (state.kind !== "ok") return [];
    return [...state.orders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [state]);

  const counts = useMemo(() => serverTabCounts ?? tabCounts(allSorted), [serverTabCounts, allSorted]);
  const filtered = useMemo(
    () => {
      const base = isDeliveryHub ? allSorted : filterByTab(allSorted, tab);
      return isDeliveryHub ? filterOrdersByHubFilter(base, hubOrderFilter) : base;
    },
    [allSorted, isDeliveryHub, tab, hubOrderFilter]
  );
  const loginHref = "/login";

  /** 결제 전 주문 취소 — 확인 시트(danger) 에서 확인한 뒤에만 호출 */
  const runCancelPending = useCallback(
    async (orderId: string) => {
      setCancelBusyId(orderId);
      try {
        const { status, json } = await patchMeStoreOrder(orderId, { cancel: true });
        const j = json as { ok?: boolean; error?: string };
        if (status < 200 || status >= 300 || j?.ok === false) {
          notify(t(resolveStoreOrderMutationErrorKey("cancel", j?.error)), "error");
          return;
        }
        notify(t("mypage_comp_orders_cancel_success"), "success");
        invalidateMypageSummary();
        await load({ silent: true, force: true });
      } catch {
        notify(t("mypage_comp_network_error"), "error");
      } finally {
        setCancelBusyId(null);
      }
    },
    [load, notify, t]
  );

  /** 목록에서 숨기기 — 확인 시트에서 확인한 뒤에만 호출 */
  const runHideOrder = useCallback(
    async (orderId: string) => {
      setDeleteBusyId(orderId);
      try {
        const { status, json } = await deleteMeStoreOrder(orderId);
        const j = json as { ok?: boolean; error?: string };
        if (status < 200 || status >= 300 || j?.ok === false) {
          notify(t(resolveStoreOrderMutationErrorKey("hide", j?.error)), "error");
          return;
        }
        notify(t("mypage_comp_orders_hide_success"), "success");
        invalidateMypageSummary();
        await load({ silent: true, force: true });
      } catch {
        notify(t("mypage_comp_network_error"), "error");
      } finally {
        setDeleteBusyId(null);
      }
    },
    [load, notify, t]
  );

  const requestCancelPending = useCallback((orderId: string) => setConfirm({ kind: "cancel", orderId }), []);
  /** 행 ⋯ — 액션 시트 [목록에서 숨기기] → 확인 시트 */
  const openOrderActions = useCallback((orderId: string) => setActionSheetOrderId(orderId), []);

  const showTabs = !isDeliveryHub;
  const errorKey = state.kind === "error" ? resolveStoreOrdersLoadErrorKey(state.message) : null;

  return (
    <OverlayScopeProvider attrs={isDeliveryHub ? ORDERS_HUB_SCOPE : ORDERS_MYPAGE_SCOPE}>
    <div
      data-store-orders-surface={isDeliveryHub ? "delivery-hub" : "mypage"}
      data-delivery-scope="orders"
      className={
        isDeliveryHub
          ? // C5: 배달 허브 고유 배경 — 토큰 `--sol-page-bg` (기존 값과 같은 값)
            `min-h-0 min-w-0 flex-1 bg-[color:var(--sol-page-bg)] ${deliveryHubBodyBottomClass}`
          : embedded
            ? "min-w-0 pb-1"
            : "w-full min-h-0 bg-sam-app"
      }
    >
      <div
        className={
          isDeliveryHub
            ? "mx-auto w-full min-w-0 max-w-none px-3 py-3 sm:px-4"
            : embedded
              ? "mx-auto w-full min-w-0 max-w-none px-0 pt-0"
              : "min-w-0 w-full min-h-0 flex flex-col gap-1"
        }
      >
        {toast ? (
          <p className="mb-3 rounded-ui-rect bg-[color:var(--sol-toast-bg)] px-3 py-2.5 text-center sam-text-body-secondary text-[color:var(--sol-toast-fg)] shadow-md">
            {toast}
          </p>
        ) : null}

        {state.kind === "loading" ? (
          isMypageScreen ? (
            <StoreOrdersListSkeleton showTabs={showTabs} />
          ) : (
            <div
              className={`mb-3 rounded-ui-rect bg-[color:var(--sol-box-bg)] px-4 py-10 text-center text-sm ${FB_MUTED} shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06]`}
            >
              {t("mypage_comp_loading_short")}
            </div>
          )
        ) : null}

        {state.kind === "unauth" ? (
          <div
            className={`rounded-ui-rect border ${FB_DIVIDER} bg-[color:var(--sol-box-bg)] px-4 py-4 text-center sam-text-body text-[color:var(--sol-warn-fg)]`}
          >
            <p>{t("mypage_comp_orders_list_login_prompt")}</p>
            <Link
              href={loginHref}
              className="mt-3 inline-flex rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-semibold text-[color:var(--sol-on-accent)]"
            >
              {t("mypage_comp_orders_list_login_cta")}
            </Link>
          </div>
        ) : null}

        {state.kind === "error" && errorKey ? (
          isMypageScreen ? (
            <MyStateView kind="error" error={{ message: t(errorKey), onRetry: () => void load() }} />
          ) : (
            <div
              role="alert"
              className={`space-y-2 rounded-ui-rect border ${FB_DIVIDER} bg-[color:var(--sol-box-bg)] px-4 py-4`}
            >
              {/* 오류 코드·영문 메시지 노출 금지 — i18n 문구만 (C.0.2) */}
              <p
                className={`sam-text-body ${
                  errorKey === "mypage_oa_orders_load_failed"
                    ? "text-[color:var(--sol-danger)]"
                    : "text-[color:var(--sol-note-fg)]"
                }`}
              >
                {t(errorKey)}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="sam-text-body font-semibold text-signature hover:underline"
              >
                {t("common_retry")}
              </button>
            </div>
          )
        ) : null}

        {state.kind === "ok" ? (
          <>
            {showTabs ? (
              <div
                className={
                  embedded
                    ? `sticky top-0 z-10 mb-3 -mx-3 rounded-ui-rect border ${FB_DIVIDER} bg-sam-surface shadow-sm sm:-mx-4 lg:mx-0`
                    : `-mx-4 mb-2 shrink-0 border-b ${FB_DIVIDER} bg-sam-surface/95 backdrop-blur-sm md:-mx-5`
                }
              >
                <div className={embedded ? "px-0" : "px-4 md:px-5"}>
                  <MemberOrderTabs variant="feed" active={tab} onChange={setTab} counts={counts} />
                </div>
              </div>
            ) : null}

            {allSorted.length === 0 ? (
              isMypageScreen ? (
                <MyStateView
                  kind="empty"
                  empty={{
                    icon: <Store className="h-6 w-6" aria-hidden />,
                    title: t("mypage_comp_orders_list_empty"),
                    cta: (
                      <Link href="/stores" className="sam-btn sam-btn--primary sam-btn--sm">
                        {t("mypage_comp_browse_stores")}
                      </Link>
                    ),
                  }}
                />
              ) : (
                <div
                  className={
                    isDeliveryHub
                      ? "rounded-ui-rect border border-[color:var(--sol-card-border)] bg-[color:var(--sol-card-bg)] p-6 text-center text-[14px] leading-[1.35] text-[color:var(--sol-empty-fg)]"
                      : `rounded-ui-rect bg-[color:var(--sol-box-bg)] px-4 py-8 text-center text-sm ${FB_MUTED} shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06]`
                  }
                >
                  <p className={FB_BODY}>{t("mypage_comp_orders_list_empty")}</p>
                  <Link
                    href="/stores"
                    className="mt-4 inline-block rounded-ui-rect bg-signature px-4 py-2.5 text-sm font-semibold text-[color:var(--sol-on-accent)] hover:opacity-95"
                  >
                    {t("mypage_comp_browse_stores")}
                  </Link>
                </div>
              )
            ) : filtered.length === 0 && isMypageScreen ? (
              <p data-testid="store-orders-tab-empty" className="px-4 py-12 text-center sam-text-body text-sam-muted">
                {t("mypage_oa_tab_empty")}
              </p>
            ) : (
              <ul className={isDeliveryHub || embedded ? "space-y-2.5" : "min-w-0 space-y-3"}>
                {filtered.map((o) => (
                  <li key={o.id} id={isDeliveryHub ? `order-card-${o.id}` : undefined}>
                    <MyStoreOrderCard
                      order={o}
                      detailHref={
                        ordersHubPaths
                          ? canonicalHubHref("orders", { expand: o.id, orderFilter: hubOrderFilter !== "all" ? hubOrderFilter : null })
                          : `/mypage/store-orders/${encodeURIComponent(o.id)}`
                      }
                      chatHref={resolveBuyerStoreOrderChatHref({
                        order: o,
                        ordersHubPaths,
                        returnHref:
                          isDeliveryHub && expandedOrderId === o.id
                            ? canonicalHubHref("orders", {
                                expand: o.id,
                                orderFilter: hubOrderFilter !== "all" ? hubOrderFilter : null,
                              })
                            : ordersListHref,
                      })}
                      chatDisabled={isStoreOrderChatDisabledForBuyer(o.order_status)}
                      orderChatUnread={Math.max(0, Number(o.order_chat_unread_count) || 0)}
                      onCancelPending={requestCancelPending}
                      cancelBusy={cancelBusyId === o.id}
                      allowDelete={!ordersHubPaths}
                      onDelete={openOrderActions}
                      deleteBusy={deleteBusyId === o.id}
                      cardVariant={isDeliveryHub ? "deliveryHub" : "default"}
                      expandMode={isDeliveryHub}
                      expanded={
                        isDeliveryHub &&
                        expandedOrderId === o.id &&
                        chatOrderId !== o.id &&
                        reviewOrderId !== o.id
                      }
                      onToggleExpand={
                        isDeliveryHub ? () => toggleExpandOrder(o.id) : undefined
                      }
                      onOpenChat={isDeliveryHub ? () => openChatOrder(o.id) : undefined}
                      onOpenReview={
                        isDeliveryHub && !!o.can_submit_review ?
                          () => openReviewOrder(o.id)
                        : undefined
                      }
                      ordersListHref={ordersListHref}
                      onExpandPanelMutated={() => void load({ silent: true })}
                      onPrefetchExpand={() => prefetchExpandDetail(o.id)}
                      onNotify={notify}
                    />
                  </li>
                ))}
              </ul>
            )}
            {isMypageScreen ? (
              <MyListPager
                hasMore={Boolean(state.nextCursor)}
                loading={moreBusy}
                error={moreError}
                onLoadMore={loadMore}
              />
            ) : state.nextCursor ? (
              <div className="mt-3 flex flex-col items-center gap-2" data-store-orders-load-more="1">
                {moreError ? <p className="text-sm text-sam-muted">{t("mypage_orders_load_more_failed")}</p> : null}
                <button
                  type="button"
                  disabled={moreBusy}
                  onClick={() => void loadMore()}
                  className="sam-btn sam-btn--secondary sam-btn--sm disabled:opacity-60"
                >
                  {moreBusy ? t("common_loading") : moreError ? t("common_retry") : t("mypage_orders_load_more")}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <DibayActionSheet
        open={actionSheetOrderId != null}
        onClose={() => setActionSheetOrderId(null)}
        cancelLabel={t("common_cancel")}
        items={[
          {
            key: "hide",
            label: t("mypage_oa_order_hide_action"),
            danger: true,
            onClick: () => {
              const id = actionSheetOrderId;
              if (id) setConfirm({ kind: "hide", orderId: id });
            },
          },
        ]}
      />
      <MobileConfirmBottomSheet
        open={confirm != null}
        onCancel={() => setConfirm(null)}
        title={
          confirm?.kind === "hide"
            ? t("mypage_comp_orders_list_confirm_hide")
            : t("mypage_comp_orders_list_confirm_cancel")
        }
        cancelLabel={t("common_cancel")}
        confirmLabel={confirm?.kind === "hide" ? t("mypage_oa_order_hide_action") : t("mypage_comp_cancel_order")}
        confirmTone="danger"
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (!c) return;
          if (c.kind === "hide") void runHideOrder(c.orderId);
          else void runCancelPending(c.orderId);
        }}
      />
      {isDeliveryHub && chatOrderId && chatOrder ?
        <BuyerStoreOrderChatSlidePanel
          orderId={chatOrderId}
          order={chatOrder}
          onClose={closeChatOrder}
        />
      : null}
      {isDeliveryHub && reviewOrderId ?
        <BuyerStoreOrderReviewSlidePanel
          orderId={reviewOrderId}
          storeName={reviewOrder?.store_name}
          onClose={closeReviewOrder}
          onSubmitted={() => void load({ silent: true })}
        />
      : null}
    </div>
    </OverlayScopeProvider>
  );
}
