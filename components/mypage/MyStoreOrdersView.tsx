"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MyStoreOrderExpandPanel,
  type BuyerStoreOrderExpandListSeed,
} from "@/components/mypage/MyStoreOrderExpandPanel";
import { BuyerStoreOrderCompletedReviewBlock } from "@/components/mypage/BuyerStoreOrderCompletedReviewBlock";
import { BuyerStoreOrderChatSlidePanel } from "@/components/mypage/BuyerStoreOrderChatSlidePanel";
import { BuyerStoreOrderReviewSlidePanel } from "@/components/mypage/BuyerStoreOrderReviewSlidePanel";
import { CommerceCartHubHeaderRight } from "@/components/layout/CommerceCartHubHeaderRight";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MemberOrderStatusBadge } from "@/components/member-orders/MemberOrderStatusBadge";
import { MemberOrderTabs } from "@/components/member-orders/MemberOrderTabs";
import { memberOrderStatusUserMessage } from "@/lib/member-orders/member-order-labels";
import type { MemberOrderStatus, MemberOrderTab } from "@/lib/member-orders/types";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { isStoreOrderChatDisabledForBuyer } from "@/lib/stores/order-status-transitions";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { PHILIFE_FEED_INSET_NEG_X_CLASS, PHILIFE_FEED_INSET_X_CLASS } from "@/lib/philife/philife-flat-ui-classes";
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
          paymentAmount: args.order.payment_amount,
          firstLineProductTitle: args.order.items?.[0]?.product_title_snapshot ?? null,
          thumbnailUrl: args.order.store_profile_image_url ?? null,
        })
      ),
      entryOrigin: "delivery",
      returnHref: args.returnHref,
    });
  }
  if (args.ordersHubPaths) {
    return `/orders/store/${encodeURIComponent(args.order.id)}/chat`;
  }
  return `/mypage/store-orders/${encodeURIComponent(args.order.id)}/chat`;
}

const MEMBER_STATUSES = new Set<string>([
  "pending",
  "accepted",
  "preparing",
  "delivering",
  "ready_for_pickup",
  "arrived",
  "completed",
  "cancelled",
  "cancel_requested",
  "refund_requested",
  "refunded",
]);

function isMemberOrderStatus(s: string): s is MemberOrderStatus {
  return MEMBER_STATUSES.has(s);
}

function filterByTab(rows: OrderRow[], tab: MemberOrderTab): OrderRow[] {
  return rows.filter((o) => {
    const s = o.order_status;
    switch (tab) {
      case "all":
        return true;
      case "active":
        return ["pending", "accepted", "preparing", "delivering", "ready_for_pickup", "arrived"].includes(
          s
        );
      case "done":
        return s === "completed";
      case "issue":
        return ["cancelled", "cancel_requested", "refund_requested", "refunded"].includes(s);
      default:
        return true;
    }
  });
}

function tabCounts(rows: OrderRow[]): Record<MemberOrderTab, number> {
  const keys: MemberOrderTab[] = ["all", "active", "done", "issue"];
  const o: Record<MemberOrderTab, number> = { all: 0, active: 0, done: 0, issue: 0 };
  for (const k of keys) o[k] = filterByTab(rows, k).length;
  return o;
}

function isDeliveryFulfillment(ft: string) {
  return ft === "local_delivery" || ft === "shipping";
}

function statusUserLine(status: string, lang: AppLanguageCode) {
  if (isMemberOrderStatus(status)) {
    return memberOrderStatusUserMessage(status, lang);
  }
  return BUYER_ORDER_STATUS_LABEL[status] ?? status;
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

const FB_MUTED = "text-[#65676B] dark:text-[#B0B3B8]";
const FB_BODY = "text-[#050505] dark:text-[#E4E6EB]";
const FB_HOVER_ROW = "hover:bg-sam-surface-muted dark:hover:bg-[#3A3B3C]";
const FB_DIVIDER = "border-[#CED0D4]/80 dark:border-[#3E4042]";

function FeedActionRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`flex min-h-[44px] divide-x divide-[#CED0D4]/70 dark:divide-[#3E4042] border-t ${FB_DIVIDER}`}
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
    statusUserLine(o.order_status, language)
  );
  const actionCell = `flex min-h-[44px] min-w-0 flex-1 items-center justify-center px-1 text-center sam-text-body-secondary font-semibold transition-colors sm:text-sm ${FB_BODY} ${FB_HOVER_ROW}`;
  const actionCellSignature = `flex min-h-[44px] min-w-0 flex-1 items-center justify-center px-1 text-center sam-text-body-secondary font-semibold transition-colors sm:text-sm text-signature ${FB_HOVER_ROW}`;
  const storeHref = o.store_slug?.trim()
    ? `/stores/${encodeURIComponent(o.store_slug.trim())}`
    : null;

  const summaryInner = (
    <div className="flex items-start justify-between gap-3">
      <p className={`min-w-0 flex-1 truncate sam-text-body font-semibold ${FB_BODY}`}>{menuSummary}</p>
      <span className={`shrink-0 sam-text-body font-semibold tabular-nums sm:text-base ${FB_BODY}`}>
        {formatMoneyPhp(o.payment_amount)}
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
          ? "relative overflow-hidden rounded-[4px] border border-[#DDE5E0] bg-white shadow-none"
          : "relative overflow-hidden rounded-ui-rect bg-sam-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:ring-sam-surface/[0.08]"
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
                className="bg-[#E4E6EB] dark:bg-[#3A3B3C]"
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
              className="bg-[#E4E6EB] dark:bg-[#3A3B3C]"
              fallbackSrc=""
              fallbackNode={
                <div className={`sam-text-xxs font-semibold ${FB_MUTED}`}>
                  {safeT("mypage_comp_store_fallback_name")}
                </div>
              }
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
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
                <p className={`mt-0.5 sam-text-body-secondary leading-snug ${FB_MUTED}`}>
                  <span>{relTime}</span>
                  <span className="mx-1 text-[#CED0D4] dark:text-[#5F6164]" aria-hidden>
                    ·
                  </span>
                  <span className="font-mono sam-text-helper">{o.order_no}</span>
                </p>
                {o.buyer_note?.trim() ? (
                  <p className={`mt-1.5 sam-text-body-secondary font-medium text-amber-800 dark:text-amber-200`}>
                    {safeT("mypage_comp_buyer_note_present")}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
                {isMemberOrderStatus(o.order_status) ? (
                  <MemberOrderStatusBadge status={o.order_status} />
                ) : (
                  <span className="inline-flex max-w-[7rem] shrink-0 truncate rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-bold text-sam-fg dark:bg-[#3A3B3C] dark:text-[#E4E6EB]">
                    {BUYER_ORDER_STATUS_LABEL[o.order_status] ?? o.order_status}
                  </span>
                )}
                <span className="relative inline-flex shrink-0 overflow-visible">
                  <span
                    className={`rounded-ui-rect px-2 py-0.5 sam-text-xxs font-bold ${
                      delivery
                        ? "bg-[#E7F3FF] text-[#1877F2] dark:bg-signature/15 dark:text-signature"
                        : "bg-emerald-50 text-emerald-900 dark:bg-emerald-900/25 dark:text-emerald-200"
                    }`}
                  >
                    {delivery ? safeT("common_delivery_label") : safeT("member_order_pickup_short")}
                  </span>
                  {orderChatUnread > 0 ? (
                    <span
                      className="pointer-events-none absolute -right-1 -top-1 z-[2] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#F02849] px-0.5 sam-text-xxs font-bold leading-none text-white ring-2 ring-sam-surface dark:ring-[#242526]"
                      aria-label={t("mypage_comp_order_chat_unread_aria", {
                        count: orderChatUnread > 99 ? "99+" : orderChatUnread,
                      })}
                    >
                      {orderChatUnread > 99 ? "99+" : orderChatUnread}
                    </span>
                  ) : null}
                </span>
                {allowDelete && onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(o.id)}
                    disabled={deleteBusy}
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full sam-text-body font-semibold leading-none text-[#65676B] transition-colors hover:bg-sam-surface-muted disabled:opacity-50 dark:text-[#B0B3B8] dark:hover:bg-[#3A3B3C]`}
                    aria-label={t("mypage_comp_orders_list_delete_aria")}
                    title={t("mypage_comp_orders_list_delete_title")}
                  >
                    {deleteBusy ? "…" : "×"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className={`mt-3 border-t ${FB_DIVIDER} pt-3`}>
              {expandMode && onToggleExpand ? (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  onPointerEnter={onExpandPointerEnter}
                  onFocus={onExpandPointerEnter}
                  className="block w-full rounded-[4px] text-left transition-colors hover:bg-[#F6FAFC]"
                  aria-expanded={expanded}
                >
                  {summaryInner}
                </button>
              ) : (
                <Link href={detailHref} className="block rounded-[4px] transition-colors hover:bg-[#F6FAFC]">
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
            className={`flex min-h-[44px] min-w-0 flex-1 cursor-not-allowed items-center justify-center px-1 text-center sam-text-body-secondary font-medium text-[#BCC0C4] dark:text-[#6F7175] sm:text-sm`}
          >
            {t("store_messenger_order_chat_label")}
          </span>
        ) : expandMode && onOpenChat ? (
          <button type="button" onClick={onOpenChat} className={actionCellSignature}>
            {t("store_messenger_order_chat_label")}
          </button>
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
        />
      ) : null}

      {canCancelHere && onCancelPending && !(expandMode && expanded) ? (
        <button
          type="button"
          disabled={cancelBusy}
          onClick={() => onCancelPending(o.id)}
          className={`w-full border-t ${FB_DIVIDER} py-2.5 text-center sam-text-body font-semibold text-[#F02849] transition-colors hover:bg-sam-surface-muted disabled:opacity-50 dark:hover:bg-[#3A3B3C]`}
        >
          {cancelBusy ? t("mypage_comp_processing") : t("mypage_comp_cancel_order")}
        </button>
      ) : null}
    </article>
  );
}

export function MyStoreOrdersView({
  embedded = false,
  suppressTier1Sync = false,
  variant = "default",
  initialExpandOrderId = null,
}: {
  embedded?: boolean;
  suppressTier1Sync?: boolean;
  /** `/orders` 배달 허브 — 오너 주문 UI 톤, 상태 탭·채팅 중복 없음 */
  variant?: "default" | "deliveryHub";
  /** `/orders?expand=` 딥링크 — 해당 주문 카드 자동 펼침 */
  initialExpandOrderId?: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const isDeliveryHub = variant === "deliveryHub";
  const ordersHubPaths = embedded || isDeliveryHub;
  const ordersListHref = ordersHubPaths ? "/orders" : "/mypage/store-orders";
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(
    initialExpandOrderId?.trim() || null
  );
  const expandScrollRef = useRef<string | null>(null);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null);
  const [tab, setTab] = useState<MemberOrderTab>("all");
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unauth" }
    | { kind: "error"; message: string }
    | { kind: "ok"; orders: OrderRow[] }
  >({ kind: "loading" });

  const load = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const silent = opts?.silent === true;
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
        setState({ kind: "ok", orders: (data.orders ?? []) as OrderRow[] });
      } catch {
        if (!silent) setState({ kind: "error", message: "network_error" });
      }
    },
    []
  );

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
        const url = next ? `/orders?expand=${encodeURIComponent(next)}` : "/orders";
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
      router.replace("/orders", { scroll: false });
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
      router.replace("/orders", { scroll: false });
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

  const counts = useMemo(() => tabCounts(allSorted), [allSorted]);
  const filtered = useMemo(
    () => (isDeliveryHub ? allSorted : filterByTab(allSorted, tab)),
    [allSorted, isDeliveryHub, tab]
  );
  const loginHref = "/login";

  const requestCancelPending = useCallback(
    async (orderId: string) => {
      if (!confirm(t("mypage_comp_orders_list_confirm_cancel"))) return;
      setCancelBusyId(orderId);
      try {
        const { status, json } = await patchMeStoreOrder(orderId, { cancel: true });
        const j = json as { ok?: boolean; error?: string };
        if (status < 200 || status >= 300 || j?.ok === false) {
          const code = typeof j?.error === "string" ? j.error : "cancel_failed";
          const msg =
            code === "cannot_cancel_after_accepted"
              ? t("mypage_comp_orders_cancel_err_short")
              : t("mypage_comp_cancel_failed_code", { code });
          setToast(msg);
          setTimeout(() => setToast(null), 3200);
          return;
        }
        setToast(t("mypage_comp_orders_cancel_success"));
        setTimeout(() => setToast(null), 2800);
        await load({ silent: true });
      } catch {
        setToast(t("mypage_comp_network_error"));
        setTimeout(() => setToast(null), 2800);
      } finally {
        setCancelBusyId(null);
      }
    },
    [load, t]
  );

  const requestHideOrder = useCallback(
    async (orderId: string) => {
      if (!confirm(t("mypage_comp_orders_list_confirm_hide"))) return;
      setDeleteBusyId(orderId);
      try {
        const { status, json } = await deleteMeStoreOrder(orderId);
        const j = json as { ok?: boolean; error?: string };
        if (status < 200 || status >= 300 || j?.ok === false) {
          const code = typeof j?.error === "string" ? j.error : "hide_failed";
          const msg =
            code === "buyer_hide_schema_missing"
              ? t("mypage_comp_orders_hide_schema_missing")
              : t("mypage_comp_orders_hide_failed", { code });
          setToast(msg);
          setTimeout(() => setToast(null), 3200);
          return;
        }
        setToast(t("mypage_comp_orders_hide_success"));
        setTimeout(() => setToast(null), 2400);
        await load({ silent: true });
      } catch {
        setToast(t("mypage_comp_network_error"));
        setTimeout(() => setToast(null), 2800);
      } finally {
        setDeleteBusyId(null);
      }
    },
    [load, t]
  );

  return (
    <div
      className={
        isDeliveryHub
          ? "min-h-0 min-w-0 flex-1 bg-[#f6f6f6] pb-[max(0.75rem,var(--safe-bottom))]"
          : embedded
            ? "min-w-0 pb-1"
            : "w-full min-h-0 bg-sam-app dark:bg-[#18191A]"
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
          <p className="mb-3 rounded-ui-rect bg-[#050505] px-3 py-2.5 text-center sam-text-body-secondary text-white shadow-md dark:bg-[#E4E6EB] dark:text-[#050505]">
            {toast}
          </p>
        ) : null}

        {state.kind === "loading" ? (
          <div
            className={`mb-3 rounded-ui-rect bg-sam-surface px-4 py-10 text-center text-sm ${FB_MUTED} shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:ring-sam-surface/[0.08]`}
          >
            {t("mypage_comp_loading_short")}
          </div>
        ) : null}

        {state.kind === "unauth" ? (
          <div
            className={`rounded-ui-rect border ${FB_DIVIDER} bg-sam-surface px-4 py-4 text-center sam-text-body text-amber-900 dark:bg-[#242526] dark:text-amber-200`}
          >
            <p>{t("mypage_comp_orders_list_login_prompt")}</p>
            <Link
              href={loginHref}
              className="mt-3 inline-flex rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-semibold text-white"
            >
              {t("mypage_comp_orders_list_login_cta")}
            </Link>
          </div>
        ) : null}

        {state.kind === "error" ? (
          <div
            className={`space-y-2 rounded-ui-rect border ${FB_DIVIDER} bg-sam-surface px-4 py-4 dark:bg-[#242526]`}
          >
            {state.message === "supabase_unconfigured" ? (
              <p className={`sam-text-body text-amber-800 dark:text-amber-200`}>
                {t("mypage_comp_orders_supabase_unconfigured")}
              </p>
            ) : null}
            <p className={`sam-text-body text-[#F02849]`}>
              {t("mypage_comp_orders_list_load_failed")} ({state.message})
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="sam-text-body font-semibold text-signature hover:underline"
            >
              {t("common_retry")}
            </button>
          </div>
        ) : null}

        {state.kind === "ok" ? (
          <>
            {!isDeliveryHub ? (
              <div
                className={
                  embedded
                    ? `sticky top-0 z-10 mb-3 -mx-3 rounded-ui-rect border ${FB_DIVIDER} bg-sam-surface shadow-sm dark:bg-[#242526] sm:-mx-4 lg:mx-0`
                    : `${PHILIFE_FEED_INSET_NEG_X_CLASS} shrink-0 border-b ${FB_DIVIDER} bg-sam-surface/95 backdrop-blur-sm dark:bg-[#242526]/95`
                }
              >
                <div className={embedded ? "px-0" : PHILIFE_FEED_INSET_X_CLASS}>
                  <MemberOrderTabs variant="feed" active={tab} onChange={setTab} counts={counts} />
                </div>
              </div>
            ) : null}

            {allSorted.length === 0 ? (
              <div
                className={
                  isDeliveryHub
                    ? "rounded-[4px] border border-[#DDE5E0] bg-white p-6 text-center text-[14px] leading-[1.35] text-[#6B7280]"
                    : `rounded-ui-rect bg-sam-surface px-4 py-8 text-center text-sm ${FB_MUTED} shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:bg-[#242526] dark:ring-sam-surface/[0.08]`
                }
              >
                <p className={FB_BODY}>{t("mypage_comp_orders_list_empty")}</p>
                <Link
                  href="/stores"
                  className="mt-4 inline-block rounded-ui-rect bg-signature px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
                >
                  {t("mypage_comp_browse_stores")}
                </Link>
              </div>
            ) : (
              <ul className={isDeliveryHub || embedded ? "space-y-2.5" : "min-w-0 space-y-3"}>
                {filtered.map((o) => (
                  <li key={o.id} id={isDeliveryHub ? `order-card-${o.id}` : undefined}>
                    <MyStoreOrderCard
                      order={o}
                      detailHref={
                        ordersHubPaths
                          ? `/orders?expand=${encodeURIComponent(o.id)}`
                          : `/mypage/store-orders/${encodeURIComponent(o.id)}`
                      }
                      chatHref={resolveBuyerStoreOrderChatHref({
                        order: o,
                        ordersHubPaths,
                        returnHref:
                          isDeliveryHub && expandedOrderId === o.id
                            ? `/orders?expand=${encodeURIComponent(o.id)}`
                            : ordersListHref,
                      })}
                      chatDisabled={isStoreOrderChatDisabledForBuyer(o.order_status)}
                      orderChatUnread={Math.max(0, Number(o.order_chat_unread_count) || 0)}
                      onCancelPending={requestCancelPending}
                      cancelBusy={cancelBusyId === o.id}
                      allowDelete={!ordersHubPaths}
                      onDelete={requestHideOrder}
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
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
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
  );
}
