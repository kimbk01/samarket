"use client";

import "@/app/store-order-list-tokens.css";
import { resolveMyStickyCtaBodyClearanceClass } from "@/lib/mypage/my-sticky-cta-placement";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommerceCartHubHeaderRight } from "@/components/layout/CommerceCartHubHeaderRight";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { storeOrderAwaitingFirstPayment } from "@/lib/stores/store-order-awaiting-payment";
import {
  canBuyerRequestStoreCancel,
  isStoreOrderChatDisabledForBuyer,
} from "@/lib/stores/order-status-transitions";
import {
  orderLineOptionsDetailLines,
  orderLineOptionsSummary,
} from "@/lib/stores/product-line-options";
import { formatMoneyPhp } from "@/lib/utils/format";
import { StoreOrderReceiptSheet } from "@/components/mypage/StoreOrderReceiptSheet";
import {
  formatPhMobileDisplay,
  parsePhMobileInput,
  telHrefFromPhDb09,
} from "@/lib/utils/ph-mobile";
import { StoreOrderDeliveryAddressDisplay } from "@/components/addresses/StoreOrderDeliveryAddressDisplay";
import { StoreCommerceOrderTimeline } from "@/components/stores/StoreCommerceOrderTimeline";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import type { CompletedOrderReorderPayload } from "@/lib/stores/apply-completed-order-to-commerce-cart";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { buildMemberSupportContext } from "@/lib/support/support-context";
import { shouldEnableStoreOrderSupportFab } from "@/lib/support/store-order-support-fab";
import { BuyerStoreOrderCompletedReviewBlock } from "@/components/mypage/BuyerStoreOrderCompletedReviewBlock";
import type { BuyerStoreOrderReviewSummary } from "@/lib/stores/buyer-store-order-review-meta";
import { StoreOrderMessengerDeepLink } from "@/components/stores/StoreOrderMessengerDeepLink";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { buildMessengerContextInputFromStoreOrderSnapshot } from "@/lib/community-messenger/store-order-messenger-context";
import {
  fetchMeStoreOrderDetailDeduped,
  fetchMeStoreOrderEventsDeduped,
  patchMeStoreOrder,
} from "@/lib/stores/store-delivery-api-client";
import {
  clearStoreOrderDetailSeed,
  getStoreOrderDetailSeed,
  type StoreOrderDetailSeed,
} from "@/lib/stores/store-order-detail-seed-cache";
import { useCustomerStoreOrderRowRealtime } from "@/hooks/delivery-customer/useCustomerStoreOrderRowRealtime";
import { useSupabaseStoreOrderDeliveriesRealtime } from "@/hooks/useSupabaseStoreOrderDeliveriesRealtime";
import {
  buyerFulfillmentLabel,
  buyerReviewProcessLabel,
  buyerStoreOrderProgressCopy,
  formatStoreOrderCheckoutEtaSummaryI18n,
  lineDiscountDisplayI18n,
  paymentStatusLabel,
  storeOrderEventActorLabel,
  storeOrderEventLabels,
} from "@/lib/mypage/store-order-detail-i18n";
import {
  dibayPerfMaybeEmitCustomerStatusAfterOwner,
  dibayPerfOnOrderDetailVisible,
  dibayPerfRecordOrderDetailSeedHydrated,
  dibayPerfRecordOrderDetailSeedUsed,
} from "@/lib/dibay/delivery-flow-perf";
import { postNotificationThreadRead } from "@/lib/notifications/client/notification-event-read-client";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import {
  MyStickyCta,
  type MyStickyCtaAction,
} from "@/components/mypage/ds/MyStickyCta";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import {
  isStoreOrderCancelReasonValid,
  resolveStoreOrderDetailCtaPlan,
  resolveStoreOrderMutationErrorKey,
  resolveStoreOrdersLoadErrorKey,
  storeOrderSeedStatusLabel,
  STORE_ORDER_CANCEL_REASON_MAX,
  type StoreOrderDetailCtaAction,
} from "@/lib/mypage/my-store-orders-ui";
import { useStoreOrderReorderAgain } from "@/components/mypage/StoreOrderReorderAgainButton";

type ItemRow = {
  id: string;
  product_id: string;
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  subtotal: number;
  options_snapshot_json?: unknown;
};

type StoreOrderEventPublic = {
  id: string;
  actor_role: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

type OrderDetail = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  store_profile_image_url?: string | null;
  total_amount: number;
  discount_amount: number;
  payment_amount: number;
  gift_redemption_amount?: number;
  amount_before_gift?: number;
  coupon_offer_title?: string | null;
  coupon_number?: string | null;
  user_coupon_id?: string | null;
  coupon_campaign_id?: string | null;
  delivery_fee_amount?: number | null;
  delivery_courier_label?: string | null;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note: string | null;
  buyer_phone?: string | null;
  buyer_payment_method?: string | null;
  buyer_payment_method_detail?: string | null;
  delivery_address_summary?: string | null;
  delivery_address_detail?: string | null;
  /** 매장 등록 영업 주소 — 픽업 안내용 */
  store_pickup_address_lines?: string[];
  created_at: string;
  updated_at: string;
  auto_complete_at?: string | null;
  community_messenger_room_id?: string | null;
  estimated_prep_minutes?: number | null;
  estimated_ready_at?: string | null;
  accepted_at?: string | null;
  admin_locked?: boolean | null;
  delivery?: {
    order_id: string;
    rider_id: string | null;
    delivery_status: string;
    assigned_at: string | null;
    picked_up_at: string | null;
    delivered_at: string | null;
    rider_accepted_at?: string | null;
    customer_arrived_at?: string | null;
    delivered_confirmed_at?: string | null;
    delivered_receiver_hint?: string | null;
    updated_at: string | null;
  } | null;
  sla_warning_level?: string | null;
  sla_warning_reason?: string | null;
  sla_warning_at?: string | null;
  needs_admin_attention?: boolean | null;
  checkout_eta_minutes?: number | null;
  checkout_route_distance_meters?: number | null;
};

/** S31 스켈레톤 — 상태 단계 바 + 매장 행 + 메뉴 3줄 + 금액 4줄 + 하단 CTA 자리 */
function StoreOrderDetailSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  const card = "rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4";
  return (
    <div aria-busy="true" data-testid="store-order-detail-skeleton" className="space-y-4">
      <div className={card}>
        <div className="flex items-center gap-2.5">
          <span className="h-11 w-11 shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
          <span className="flex flex-1 flex-col gap-2">
            <span className={`h-4 w-[45%] ${bone}`} />
            <span className={`h-3 w-[30%] ${bone}`} />
          </span>
        </div>
        <span className={`mt-3 block h-20 w-full ${bone}`} />
      </div>
      <div className={card}>
        <span className={`block h-3 w-24 ${bone}`} />
        {[0, 1, 2].map((i) => (
          <span key={i} className={`mt-3 block h-4 w-[80%] ${bone}`} data-skeleton-row="" />
        ))}
      </div>
      <div className={card}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mt-2 flex justify-between first:mt-0" data-skeleton-row="">
            <span className={`h-3.5 w-[35%] ${bone}`} />
            <span className={`h-3.5 w-[20%] ${bone}`} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <span className={`h-[46px] flex-1 ${bone}`} />
        <span className={`h-[46px] flex-[1.2] ${bone}`} />
      </div>
    </div>
  );
}

/** 완료 주문 재주문 payload — 상세 응답 그대로(추가 조회 0) */
function buildDetailReorderPayload(order: OrderDetail, items: ItemRow[]): CompletedOrderReorderPayload | null {
  if (order.order_status !== "completed") return null;
  const slug = String(order.store_slug ?? "").trim();
  const reorderItems = items
    .map((it) => ({
      product_id: String(it.product_id ?? "").trim(),
      product_title_snapshot: it.product_title_snapshot,
      price_snapshot: Math.round(Number(it.price_snapshot) || 0),
      qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
      options_snapshot_json: it.options_snapshot_json,
    }))
    .filter((it) => it.product_id.length > 0);
  if (!slug || reorderItems.length === 0) return null;
  return {
    storeId: order.store_id,
    storeSlug: slug,
    storeName: order.store_name,
    fulfillmentType: order.fulfillment_type,
    items: reorderItems,
  };
}

function formatPrepClock(iso: string | null | undefined, lang: AppLanguageCode): string | null {
  const s = typeof iso === "string" ? iso.trim() : "";
  if (!s) return null;
  return formatMypageDate(s, { style: "time", lang }) || null;
}

export function MyStoreOrderDetailView({ ordersHub = false }: { ordersHub?: boolean }) {
  /** 하단탭 실제 마운트 기준 CTA 본문 여백 — 탭 있음/없음 safe 1회 (M-04) */
  const stickyCtaBodyClearanceClass = resolveMyStickyCtaBodyClearanceClass(useBottomNavOccupiesClearance());
  const { t, safeT, language } = useI18n();
  const params = useParams();
  const router = useRouter();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  const listHref = ordersHub ? "/orders" : "/mypage/store-orders";
  const orderBase = ordersHub
    ? `/orders/store/${encodeURIComponent(orderId)}`
    : `/mypage/store-orders/${encodeURIComponent(orderId)}`;
  const reviewHref = `${orderBase}/review`;
  const canonicalOrderChatHref = `/orders/store/${encodeURIComponent(orderId)}/chat`;

  type ViewState =
    | { kind: "loading" }
    | { kind: "seed"; seed: StoreOrderDetailSeed; /** 상세 조회 실패 — 로딩 문구 대신 오류 표시 */ failed?: boolean }
    | { kind: "unauth" }
    | { kind: "not_found" }
    | { kind: "error"; message: string }
    | {
        kind: "ok";
        order: OrderDetail;
        items: ItemRow[];
        review: BuyerStoreOrderReviewSummary | null;
        can_submit_review: boolean;
        /** 이벤트 원장 조회 성공 시만 채움 — 없으면 기존 타임라인만 사용 */
        orderEvents?: StoreOrderEventPublic[];
      };

  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  /** 결제 전 즉시 취소 — 확인 시트(danger) */
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  /** 결제 후 취소 요청 — 사유 시트(2~500자) */
  const [reasonSheetOpen, setReasonSheetOpen] = useState(false);
  const reasonGuard = useMypageSubmitGuard();
  const cancelGuard = useMypageSubmitGuard();
  const detailPerfOnceRef = useRef<string | null>(null);
  const seedUsedOnceRef = useRef<string | null>(null);
  const orderNotificationReadOnceRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const oid = orderId.trim();
    detailPerfOnceRef.current = null;
    seedUsedOnceRef.current = null;
    if (!oid) {
      setState({ kind: "loading" });
      return;
    }
    const hit = getStoreOrderDetailSeed(oid);
    if (hit?.id === oid) setState({ kind: "seed", seed: hit });
    else setState({ kind: "loading" });
  }, [orderId]);

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const silent = opts?.silent === true;
    const force = opts?.force === true;
    if (!orderId) {
      if (!silent) setState({ kind: "not_found" });
      return;
    }
    if (!silent) {
      const seedHit = getStoreOrderDetailSeed(orderId);
      if (seedHit?.id === orderId) setState({ kind: "seed", seed: seedHit });
      else setState({ kind: "loading" });
    }
    try {
      const [detailRes, eventsRes] = await Promise.all([
        fetchMeStoreOrderDetailDeduped(orderId, { force }),
        fetchMeStoreOrderEventsDeduped(orderId, { force }),
      ]);
      const { status, json } = detailRes;
      const data = json as {
        ok?: boolean;
        error?: string;
        order?: OrderDetail;
        items?: ItemRow[];
        review?: unknown;
        can_submit_review?: boolean;
      };
      if (status === 401) {
        if (!silent) setState({ kind: "unauth" });
        return;
      }
      if (status === 404) {
        clearStoreOrderDetailSeed(orderId);
        if (!silent) setState({ kind: "not_found" });
        return;
      }
      if (!data?.ok) {
        if (!silent) {
          setState((prev) => {
            if (prev.kind === "seed" && prev.seed.id === orderId) return { ...prev, failed: true };
            return {
              kind: "error",
              message: typeof data?.error === "string" ? data.error : "load_failed",
            };
          });
        }
        return;
      }
      const hadSeedCache = getStoreOrderDetailSeed(orderId) != null;
      clearStoreOrderDetailSeed(orderId);
      if (hadSeedCache) dibayPerfRecordOrderDetailSeedHydrated(orderId);

      let orderEvents: StoreOrderEventPublic[] | undefined;
      if (eventsRes.status === 200) {
        const ej = eventsRes.json as { ok?: boolean; events?: unknown };
        if (ej?.ok === true && Array.isArray(ej.events)) {
          orderEvents = ej.events as StoreOrderEventPublic[];
        }
      }

      setState((prev) => {
        const prevOk = prev.kind === "ok" ? prev : null;
        let nextEvents = orderEvents;
        if (nextEvents == null && silent && prevOk?.orderEvents) {
          nextEvents = prevOk.orderEvents;
        }
        return {
          kind: "ok",
          order: data.order as OrderDetail,
          items: (data.items ?? []) as ItemRow[],
          review: (data.review ?? null) as BuyerStoreOrderReviewSummary | null,
          can_submit_review: !!data.can_submit_review,
          ...(nextEvents != null ? { orderEvents: nextEvents } : {}),
        };
      });
      dibayPerfMaybeEmitCustomerStatusAfterOwner(orderId);
    } catch {
      if (!silent) {
        setState((prev) =>
          prev.kind === "seed" && prev.seed.id === orderId
            ? { ...prev, failed: true }
            : { kind: "error", message: "network_error" }
        );
      }
    }
  }, [orderId]);

  useCustomerStoreOrderRowRealtime(orderId.trim() || null, {
    debounceMs: 350,
    onChange: () => void load({ silent: true, force: true }),
  });

  useSupabaseStoreOrderDeliveriesRealtime(
    orderId.trim() ? { kind: "order", orderId } : null,
    { debounceMs: 420, onChange: () => void load({ silent: true, force: true }) }
  );

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  useLayoutEffect(() => {
    if (!orderId || (state.kind !== "ok" && state.kind !== "seed")) return;
    if (detailPerfOnceRef.current === orderId) return;
    detailPerfOnceRef.current = orderId;
    dibayPerfOnOrderDetailVisible(orderId);
  }, [state.kind, orderId]);

  useEffect(() => {
    if (!orderId || (state.kind !== "ok" && state.kind !== "seed")) return;
    if (orderNotificationReadOnceRef.current === orderId) return;
    orderNotificationReadOnceRef.current = orderId;
    void postNotificationThreadRead(orderId, {
      threadType: "order",
      readReason: "order_detail_opened",
    });
  }, [orderId, state.kind]);

  useLayoutEffect(() => {
    if (state.kind !== "seed" || !orderId) return;
    if (seedUsedOnceRef.current === orderId) return;
    seedUsedOnceRef.current = orderId;
    dibayPerfRecordOrderDetailSeedUsed(orderId);
  }, [state.kind, orderId]);

  useLayoutEffect(() => {
    if (!ordersHub || !setMainTier1Extras) return;
    setMainTier1Extras({
      tier1: {
        rightSlot: <CommerceCartHubHeaderRight />,
      },
    });
    return () => setMainTier1Extras(null);
  }, [ordersHub, setMainTier1Extras]);

  const reorderPayloadForCta = useMemo(
    () => (state.kind === "ok" ? buildDetailReorderPayload(state.order, state.items) : null),
    [state]
  );
  const reorder = useStoreOrderReorderAgain(reorderPayloadForCta);

  async function requestRefund() {
    if (!orderId || state.kind !== "ok") return;
    setRefundErr(null);
    try {
      // 진행 중 취소 요청 — 매장이 승인·반려 (사유 필수)
      const { json } = await patchMeStoreOrder(orderId, {
        request_cancel: true,
        cancel_reason: refundReason.trim(),
      });
      const j = json as { ok?: boolean; error?: string };
      if (!j?.ok) {
        setRefundErr(t(resolveStoreOrderMutationErrorKey("request_cancel", j?.error)));
        return;
      }
      setReasonSheetOpen(false);
      setRefundReason("");
      showMypageToast(t("mypage_oa_cancel_request_sent"), "success");
      invalidateMypageSummary();
      // 현재 화면 유지한 채 최신 상태로 갱신
      await load({ silent: true, force: true });
      router.refresh();
    } catch {
      setRefundErr(t("mypage_comp_network_error"));
    }
  }

  async function cancelOrder() {
    if (!orderId || state.kind !== "ok") return;
    setCancelErr(null);
    setCancelBusy(true);
    try {
      const { json } = await patchMeStoreOrder(orderId, { cancel: true });
      const j = json as { ok?: boolean; error?: string };
      if (!j?.ok) {
        const code = typeof j?.error === "string" ? j.error : "";
        const msg =
          code === "cannot_cancel_after_accepted"
            ? t("mypage_comp_cancel_err_after_accepted")
            : t(resolveStoreOrderMutationErrorKey("cancel", code));
        setCancelErr(msg);
        showMypageToast(msg, "error");
        return;
      }
      showMypageToast(t("mypage_comp_orders_cancel_success"), "success");
      invalidateMypageSummary();
      // 현재 화면 유지한 채 최신 상태로 갱신
      await load({ silent: true, force: true });
      router.refresh();
    } catch {
      setCancelErr(t("mypage_comp_network_error"));
      showMypageToast(t("mypage_comp_network_error"), "error");
    } finally {
      setCancelBusy(false);
    }
  }

  if (state.kind === "loading") {
    return <StoreOrderDetailSkeleton />;
  }
  if (state.kind === "seed") {
    const seed = state.seed;
    return (
      <div className="space-y-4">
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="sam-text-body font-semibold text-sam-fg">
              {seed.store_name || t("mypage_comp_store_fallback_name")}
            </p>
            <span className="text-xs text-sam-meta">{seed.order_no}</span>
          </div>
          <p className="mt-3 sam-text-helper text-sam-fg">
            {storeOrderSeedStatusLabel(seed, language, t("mypage_oa_order_status_neutral"))} ·{" "}
            {t("mypage_comp_order_payment_amount_label")}{" "}
            <span className="font-semibold">{formatMoneyPhp(seed.payment_amount)}</span>
            {seed.total_amount !== seed.payment_amount ? (
              <span className="text-sam-muted">
                {" "}
                {t("mypage_comp_order_total_in_parens", { amount: formatMoneyPhp(seed.total_amount) })}
              </span>
            ) : null}
          </p>
          <p className="mt-2 sam-text-xxs text-sam-muted">
            {t("mypage_comp_order_date_line", {
              datetime: formatMypageDate(seed.created_at, { style: "datetime", lang: language }),
            })}
          </p>
          <p className="mt-4 sam-text-helper text-sam-muted">
            {state.failed ? t("mypage_order_detail_load_failed") : t("mypage_comp_order_loading_detail")}
          </p>
          {state.failed ? (
            <button
              type="button"
              onClick={() => void load()}
              className="sam-btn sam-btn--secondary sam-btn--sm mt-3"
            >
              {t("common_retry")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  if (state.kind === "unauth") {
    return (
      <div className="space-y-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 text-sm text-sam-muted shadow-sm">
        <p>{t("auth_resource_access_denied")}</p>
      </div>
    );
  }
  if (state.kind === "not_found") {
    return (
      <MyStateView
        kind="empty"
        empty={{
          title: t("mypage_oa_order_not_found"),
          cta: (
            <Link href={listHref} className="sam-btn sam-btn--primary sam-btn--sm">
              {t("mypage_oa_back_to_orders")}
            </Link>
          ),
        }}
      />
    );
  }
  if (state.kind === "error") {
    // 오류 코드·영문 메시지 노출 금지 — i18n 문구만 + [다시 시도]
    const errKey = resolveStoreOrdersLoadErrorKey(state.message);
    return (
      <MyStateView
        kind="error"
        error={{
          message: errKey === "mypage_oa_orders_load_failed" ? t("mypage_order_detail_load_failed") : t(errKey),
          onRetry: () => void load(),
        }}
      />
    );
  }

  const { order, items, review, can_submit_review, orderEvents } = state;
  const reorderPayload = reorderPayloadForCta;
  const itemsSumPhp = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
  const deliveryFeePhp = Math.max(0, Math.round(Number(order.delivery_fee_amount) || 0));
  const canBuyerCancel = storeOrderAwaitingFirstPayment(order);
  const canRefundRequest = canBuyerRequestStoreCancel(order.order_status, order.payment_status);
  const refundPending = order.order_status === "refund_requested";
  const cancelRequestPending = order.order_status === "cancel_requested";
  const orderChatDisabled = isStoreOrderChatDisabledForBuyer(order.order_status);
  const payDisplay = formatBuyerPaymentDisplay(order.buyer_payment_method, order.buyer_payment_method_detail);
  const chatHref = canonicalOrderChatHref;
  const orderStatusLabel = (status: string) => buyerOrderStatusLabel(status, language, order.fulfillment_type);
  const eventLabels = storeOrderEventLabels(t);
  const prepClock = formatPrepClock(order.estimated_ready_at, language);
  const buyerProg = buyerStoreOrderProgressCopy(t, order, orderStatusLabel, prepClock);
  const reviewProcess = buyerReviewProcessLabel(t, {
    orderStatus: order.order_status,
    review,
    canSubmitReview: can_submit_review,
  });
  const fulfillLabel = buyerFulfillmentLabel(order.fulfillment_type, t);
  const dash = t("mypage_comp_placeholder_dash");
  const storeProfileImageUrl = order.store_profile_image_url?.trim() || "";

  const ctaPlan = resolveStoreOrderDetailCtaPlan({
    orderStatus: order.order_status,
    canBuyerCancel,
    canRequestCancel: canRefundRequest,
    chatDisabled: orderChatDisabled,
    hasStore: Boolean(order.store_slug?.trim()),
    canReorder: Boolean(reorderPayload),
  });
  const ctaFor = (action: StoreOrderDetailCtaAction | null): MyStickyCtaAction | null => {
    switch (action) {
      case "order_chat":
        return { label: t("mypage_comp_order_chat_nav"), onPress: () => router.push(chatHref) };
      case "view_store":
        return {
          label: t("mypage_comp_view_store"),
          onPress: () => router.push(`/stores/${encodeURIComponent(String(order.store_slug).trim())}`),
        };
      case "order_list":
        return { label: t("mypage_comp_view_order_list"), onPress: () => router.push(listHref) };
      case "cancel_order":
        return {
          label: t("mypage_comp_cancel_order"),
          onPress: () => setCancelConfirmOpen(true),
          loading: cancelBusy,
          disabled: cancelGuard.pending,
        };
      case "request_cancel":
        return {
          label: t("mypage_comp_cancel_req_submit"),
          onPress: () => {
            setRefundErr(null);
            setReasonSheetOpen(true);
          },
        };
      case "reorder":
        return {
          label: t("mypage_comp_store_reorder_default"),
          onPress: () => void reorder.run(),
          loading: reorder.busy,
          disabled: !reorder.ready,
        };
      case "receipt":
        return { label: t("mypage_receipt_open"), onPress: () => setReceiptOpen(true) };
      default:
        return null;
    }
  };
  const ctaPrimary = ctaFor(ctaPlan.primary);
  const ctaSecondaryRaw = ctaFor(ctaPlan.secondary);
  const ctaSecondary = ctaSecondaryRaw
    ? { label: ctaSecondaryRaw.label, onPress: ctaSecondaryRaw.onPress, disabled: ctaSecondaryRaw.disabled }
    : null;

  const supportContext = buildMemberSupportContext({
    enabled:
      shouldEnableStoreOrderSupportFab(order) ||
      refundPending ||
      canRefundRequest ||
      canBuyerCancel,
    category: "ORDER",
    sourceSurface: "mypage_store_order_detail",
    referenceType: "STORE_ORDER",
    referenceId: String(order.id ?? orderId),
  });

  return (
    <SupportContextProvider value={supportContext}>
    <div className={`space-y-4 ${ctaPrimary ? stickyCtaBodyClearanceClass : ""}`}>
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <SamarketThumbnail
              src={storeProfileImageUrl}
              alt={order.store_name || t("mypage_comp_store_fallback_name")}
              size={44}
              roundedClassName="rounded-full"
              className="bg-sam-surface-muted"
              fallbackSrc=""
              fallbackNode={
                <div className="text-[11px] font-semibold text-sam-muted">
                  {t("mypage_comp_store_fallback_name")}
                </div>
              }
            />
            <div className="min-w-0">
              <p className="truncate sam-text-body font-bold text-sam-fg">
                {order.store_name || t("mypage_comp_store_fallback_name")}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-sam-muted">{order.order_no}</p>
            </div>
          </div>
        </div>
        <div className="delivery-ui mt-3 rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-primary)] px-3 py-3 text-sam-on-primary">
          {order.admin_locked === true ? (
            <p className="mb-3 rounded-ui-rect border border-sam-border-soft bg-sam-info-soft px-3 py-2 sam-text-helper leading-snug text-sam-fg">
              {t("mypage_comp_admin_locked_notice")}
            </p>
          ) : null}
          {order.needs_admin_attention === true || (order.sla_warning_level ?? "").trim() ? (
            <p className="mb-3 rounded-ui-rect border border-sam-danger-soft bg-sam-danger-soft px-3 py-2 sam-text-helper leading-snug text-sam-danger">
              {t("mypage_comp_sla_delay_notice")}
              {order.sla_warning_reason?.trim() ? (
                <span className="ml-1 text-sam-muted">
                  {t("mypage_comp_sla_reason_suffix", { reason: order.sla_warning_reason.trim() })}
                </span>
              ) : null}
            </p>
          ) : null}
          <p className="sam-text-xxs font-semibold uppercase tracking-[0.08em] text-sam-on-primary/75">
            {t("mypage_comp_order_current_status_heading")}
          </p>
          <p className="mt-1 sam-text-page-title font-bold text-sam-on-primary">{buyerProg.headline}</p>
          {buyerProg.lines.length ? (
            <ul className="mt-2 list-inside list-disc space-y-1 sam-text-helper leading-relaxed text-sam-on-primary/90">
              {buyerProg.lines.map((line, i) => (
                <li key={`${i}:${line}`}>{line}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 sam-text-helper leading-relaxed text-sam-on-primary/75">
            {t("mypage_comp_order_standard_step", {
              status: orderStatusLabel(order.order_status),
              payment: paymentStatusLabel(t, order.payment_status),
            })}
          </p>
          <p className="mt-1 sam-text-xxs leading-relaxed text-sam-on-primary/70">{t("mypage_comp_order_chat_notice")}</p>
        </div>
        <div
          className={`mt-3 rounded-ui-rect border px-3 py-3 ${
            reviewProcess.tone === "done"
              ? "border-sam-border-soft bg-sam-info-soft text-sam-fg"
              : reviewProcess.tone === "action"
                ? "border-sam-warning-soft bg-sam-warning-soft text-sam-fg"
                : "border-sam-border-soft bg-sam-surface-muted text-sam-muted"
          }`}
        >
          <p className="text-[12px] font-bold leading-[1.35]">{t("mypage_comp_order_complete_review_heading")}</p>
          <p className="mt-1 text-[13px] font-semibold leading-[1.45]">{reviewProcess.label}</p>
        </div>
        {order.community_messenger_room_id ? (
          <div className="mt-3">
            <StoreOrderMessengerDeepLink
              roomId={order.community_messenger_room_id}
              context={buildMessengerContextInputFromStoreOrderSnapshot({
                orderId: order.id,
                storeName: order.store_name,
                orderNo: order.order_no,
                storeId: order.store_id,
                fulfillmentType: order.fulfillment_type,
                orderStatus: order.order_status,
                paymentAmount: order.payment_amount,
                firstLineProductTitle: items[0]?.product_title_snapshot ?? null,
                thumbnailUrl: storeProfileImageUrl || null,
              })}
            />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-sam-muted">
          {fulfillLabel}
          {" · "}
          {orderStatusLabel(order.order_status)}
        </p>
        {(order.order_status === "ready_for_pickup" ||
          order.order_status === "delivering" ||
          order.order_status === "arrived") &&
        order.auto_complete_at ? (
          <p className="mt-2 sam-text-xxs text-sam-muted">
            {t("mypage_comp_auto_complete_notice", {
              datetime: formatMypageDate(order.auto_complete_at, { style: "datetime", lang: language }),
            })}
          </p>
        ) : null}
        {storeOrderAwaitingFirstPayment(order) ? (
          <p className="mt-3 sam-text-xxs text-sam-muted">{t("mypage_comp_cancel_before_accept_hint")}</p>
        ) : null}
        {payDisplay !== dash ? (
          <p className="mt-2 text-sm font-medium text-sam-fg">
            {t("mypage_comp_payment_method_label", { method: payDisplay })}
          </p>
        ) : null}
        {order.buyer_note ? (
          <p className="mt-2 text-sm text-sam-fg">
            {t("mypage_comp_buyer_note_label", { note: order.buyer_note })}
          </p>
        ) : null}
        <p className="mt-2 sam-text-xxs text-sam-meta">
          {t("mypage_comp_order_date_line", {
            datetime: formatMypageDate(order.created_at, { style: "datetime", lang: language }),
          })}
        </p>
      </div>

      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-sam-fg">{t("mypage_comp_timeline_section")}</h2>
        {order.order_status === "pending" ? (
          <p className="mt-2 rounded-ui-rect bg-signature/5 px-3 py-2 sam-text-helper text-sam-fg">
            {t("mypage_comp_timeline_pending_notice")}
          </p>
        ) : null}
        <div className="mt-4">
          <StoreCommerceOrderTimeline
            variant="buyer_detail"
            fulfillmentType={order.fulfillment_type}
            orderStatus={order.order_status}
          />
        </div>
        {orderEvents && orderEvents.length > 0 ? (
          <div className="mt-6 border-t border-sam-border-soft pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sam-meta">
              {t("mypage_comp_order_history_heading")}
            </h3>
            <ul className="mt-2 space-y-2">
              {orderEvents.map((ev) => {
                const meta =
                  ev.metadata && typeof ev.metadata === "object"
                    ? (ev.metadata as Record<string, unknown>)
                    : null;
                const autoCompleteCron =
                  ev.event_type === "order_completed" &&
                  meta?.source === "cron_store_orders_auto_complete";
                return (
                <li
                  key={ev.id}
                  className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2 sam-text-helper text-sam-fg"
                >
                  <div className="flex flex-wrap justify-between gap-1">
                    <span className="font-medium">
                      {eventLabels[ev.event_type] ?? ev.event_type}
                      {autoCompleteCron ? t("mypage_comp_event_auto_confirm_suffix") : ""}
                    </span>
                    <span className="text-sam-meta">
                      {formatMypageDate(ev.created_at, { style: "datetime", lang: language })}
                    </span>
                  </div>
                  <p className="mt-1 text-sam-meta">
                    {storeOrderEventActorLabel(t, ev.actor_role)}
                    {ev.from_status || ev.to_status
                      ? ` · ${t("mypage_comp_order_event_status_arrow", {
                          from: ev.from_status ?? dash,
                          to: ev.to_status ?? dash,
                        })}`
                      : ""}
                  </p>
                  {ev.message?.trim() ? (
                    <p className="mt-1 text-sam-fg">{ev.message.trim()}</p>
                  ) : null}
                </li>
              );
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-bold text-sam-fg">{t("mypage_comp_order_items_heading")}</h2>

        <div className="mt-4">
          <h3 className="sam-text-xxs font-semibold text-sam-muted">
            {order.fulfillment_type === "pickup"
              ? t("mypage_comp_address_pickup_heading")
              : t("mypage_comp_address_delivery_heading")}
          </h3>
          {order.fulfillment_type === "pickup" ? (
            <div className="mt-1.5 space-y-1 text-sm leading-relaxed text-sam-fg">
              <p className="sam-text-body-secondary text-sam-muted">{t("mypage_comp_pickup_instruction")}</p>
              {order.store_pickup_address_lines && order.store_pickup_address_lines.length > 0 ? (
                order.store_pickup_address_lines.map((line, i) => (
                  <p key={i} className={i === 0 ? "font-medium text-sam-fg" : "sam-text-body-secondary text-sam-fg"}>
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-sam-warning">{t("mypage_comp_store_address_missing")}</p>
              )}
              {order.store_slug ?
                <Link
                  href={`/stores/${encodeURIComponent(order.store_slug)}/info`}
                  className="mt-2 inline-block sam-text-body-secondary font-medium text-signature underline"
                >
                  {t("mypage_comp_view_store_info")}
                </Link>
              : null}
            </div>
          ) : order.delivery_address_summary?.trim() || order.delivery_address_detail?.trim() ? (
            <div className="mt-1.5 text-sm leading-relaxed text-sam-fg">
              <StoreOrderDeliveryAddressDisplay
                summary={order.delivery_address_summary}
                detail={order.delivery_address_detail}
                showDetailLabel={false}
              />
              {(() => {
                const line = formatStoreOrderCheckoutEtaSummaryI18n(t, {
                  checkout_eta_minutes: order.checkout_eta_minutes,
                  checkout_route_distance_meters: order.checkout_route_distance_meters,
                });
                return line ?
                    <p
                      className="mt-2 sam-text-body-secondary text-sam-muted"
                      title={t("mypage_comp_checkout_eta_title")}
                    >
                      {line}
                    </p>
                  : null;
              })()}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-sam-warning">{t("mypage_comp_delivery_address_missing")}</p>
          )}
        </div>

        <div className="mt-4 border-t border-sam-border-soft pt-4">
          <h3 className="sam-text-xxs font-semibold text-sam-muted">{t("mypage_comp_buyer_contact_heading")}</h3>
          {order.buyer_phone?.trim() ? (
            <p className="mt-1.5 text-sm text-sam-fg">
              {(() => {
                const d = parsePhMobileInput(order.buyer_phone ?? "");
                const href = d.length === 11 ? telHrefFromPhDb09(d) : null;
                const label = d.length === 11 ? formatPhMobileDisplay(d) : order.buyer_phone;
                return href ? (
                  <a href={href} className="font-semibold text-signature underline">
                    {label}
                  </a>
                ) : (
                  <span className="font-mono">{label}</span>
                );
              })()}
              <span className="ml-1 sam-text-xxs font-normal text-sam-meta">
                {t("mypage_comp_phone_inquiry_suffix")}
              </span>
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-sam-muted">{t("mypage_comp_buyer_phone_missing")}</p>
          )}
        </div>

        <div className="mt-4 border-t border-sam-border-soft pt-4">
          <h3 className="sam-text-xxs font-semibold text-sam-muted">{t("mypage_comp_order_lines_heading")}</h3>
          <p className="mt-1 sam-text-xxs text-sam-meta">{t("mypage_comp_order_lines_legend")}</p>
          <ul className="mt-3 space-y-3 text-sm text-sam-fg">
            {items.map((it) => {
              const optSum = orderLineOptionsSummary(it.options_snapshot_json);
              const optLines = orderLineOptionsDetailLines(it.options_snapshot_json);
              const ps = Number(it.price_snapshot) || 0;
              const q = Number(it.qty) || 0;
              const st = Number(it.subtotal) || 0;
              const disc = lineDiscountDisplayI18n(t, ps, q, st);
              return (
                <li key={it.id} className="rounded-ui-rect bg-sam-app/80 px-3 py-2.5 ring-1 ring-sam-border-soft">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="min-w-0 flex-1 font-medium text-sam-fg">{it.product_title_snapshot}</p>
                    <span className="shrink-0 text-sam-muted">× {it.qty}</span>
                  </div>
                  {optLines.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 sam-text-helper text-sam-muted">
                      {optLines.map((row, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="min-w-0">{row.title}</span>
                          {row.amount ? (
                            <span className="shrink-0 text-sam-muted">{row.amount}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : optSum ? (
                    <p className="mt-1 sam-text-helper text-sam-muted">{optSum}</p>
                  ) : null}
                  <div className="mt-2 grid gap-1 sam-text-helper text-sam-muted sm:grid-cols-2">
                    <span>
                      {t("mypage_comp_unit_price")}{" "}
                      <span className="font-medium text-sam-fg">{formatMoneyPhp(ps)}</span>
                    </span>
                    <span>
                      {t("mypage_comp_discount_rate")}{" "}
                      <span className="font-medium text-sam-fg">{disc}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-sam-border/80 pt-2 text-sm">
                    <span className="text-sam-muted">{t("mypage_comp_line_subtotal")}</span>
                    <span className="font-semibold text-sam-fg">{formatMoneyPhp(st)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <BuyerStoreOrderCompletedReviewBlock
            variant="detail"
            listHref={listHref}
            reviewHref={reviewHref}
            storeReviewsHref={
              order.store_slug?.trim()
                ? `/stores/${encodeURIComponent(order.store_slug.trim())}/reviews`
                : null
            }
            review={review}
            canSubmitReview={can_submit_review}
            reviewStatus={
              order.order_status === "completed"
                ? review
                  ? "completed"
                  : can_submit_review
                    ? "pending"
                    : "unavailable"
                : "not_applicable"
            }
            chatHref={chatHref}
            orderChatDisabled={orderChatDisabled}
          />
        </div>

        <div className="mt-4 border-t border-sam-border-soft pt-4">
          <h3 className="sam-text-xxs font-semibold text-sam-muted">{t("mypage_comp_amount_section")}</h3>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3 text-sam-fg">
              <span>{t("mypage_comp_items_subtotal")}</span>
              <span className="font-medium text-sam-fg">{formatMoneyPhp(itemsSumPhp)}</span>
            </div>
            {Math.round(Number(order.discount_amount) || 0) > 0 ? (
              <div className="flex justify-between gap-3 text-sam-fg" data-order-coupon-discount="1">
                <span>
                  {t("store_owner_order_coupon_discount")}
                  {[order.coupon_offer_title, order.coupon_number].filter(Boolean).length > 0 ? (
                    <span className="mt-0.5 block text-xs font-normal text-sam-muted">
                      {[order.coupon_offer_title, order.coupon_number].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </span>
                <span className="font-medium text-sam-danger">
                  −{formatMoneyPhp(Math.round(Number(order.discount_amount) || 0))}
                </span>
              </div>
            ) : null}
            {Math.round(Number((order as { gift_redemption_amount?: number }).gift_redemption_amount) || 0) >
            0 ? (
              <div className="flex justify-between gap-3 text-sam-fg" data-order-gift-redemption="1">
                <span>
                  {safeT("gift_u4_order_gift_line", {
                    fallbackKo: "상품권 사용",
                    fallbackEn: "Gift certificate",
                  })}
                </span>
                <span className="font-medium text-sam-danger">
                  −
                  {formatMoneyPhp(
                    Math.round(Number((order as { gift_redemption_amount?: number }).gift_redemption_amount) || 0)
                  )}
                </span>
              </div>
            ) : null}
            {(() => {
              const giftUsed = Math.round(
                Number((order as { gift_redemption_amount?: number }).gift_redemption_amount) || 0
              );
              const st = String(order.order_status ?? "").toLowerCase();
              const refunded = st === "refunded" || st === "cancelled" || order.payment_status === "refunded";
              if (!giftUsed || !refunded) return null;
              return (
                <div className="flex justify-between gap-3 text-sam-fg" data-order-gift-restored="1">
                  <span>
                    {safeT("gift_u4_order_gift_restored", {
                      fallbackKo: "상품권 복구",
                      fallbackEn: "Gift restored",
                    })}
                  </span>
                  <span className="font-medium text-sam-success">+{formatMoneyPhp(giftUsed)}</span>
                </div>
              );
            })()}
            <div className="flex justify-between gap-3 text-sam-fg">
              <span>{t("mypage_comp_delivery_fee")}</span>
              <span className="font-medium text-sam-fg">
                {deliveryFeePhp > 0 ? formatMoneyPhp(deliveryFeePhp) : t("mypage_comp_currency_zero")}
              </span>
            </div>
            {order.delivery_courier_label?.trim() && deliveryFeePhp > 0 ? (
              <p className="sam-text-xxs leading-snug text-sam-muted">
                {t("mypage_comp_courier_hint", { label: order.delivery_courier_label.trim() })}
              </p>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-sam-border pt-2 text-base font-bold text-sam-fg">
              <span>{t("mypage_comp_grand_total")}</span>
              <span>{formatMoneyPhp(order.payment_amount)}</span>
            </div>
          </div>
        </div>

        <dl className="mt-4 space-y-2 border-t border-sam-border-soft pt-4 text-sm" data-buyer-payment-facts="1">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-sam-muted">{t("mypage_comp_payment_method_section")}</dt>
            <dd className="min-w-0 break-words text-right font-medium text-sam-fg" data-buyer-payment-method="1">
              {payDisplay !== dash ? payDisplay : dash}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-sam-muted">{t("mypage_comp_payment_status_section")}</dt>
            <dd className="min-w-0 break-words text-right text-sam-fg" data-buyer-payment-status="1">
              {paymentStatusLabel(t, order.payment_status)}
            </dd>
          </div>
        </dl>
      </div>

      <StoreOrderReceiptSheet
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        data={{
          storeName: order.store_name || t("mypage_comp_store_fallback_name"),
          storeAddressLines: order.store_pickup_address_lines ?? [],
          orderNo: order.order_no,
          orderedAt: formatMypageDate(order.created_at, { style: "datetime", lang: language }),
          lines: items.map((it) => ({
            id: it.id,
            title: it.product_title_snapshot,
            qty: Number(it.qty) || 0,
            subtotal: Number(it.subtotal) || 0,
          })),
          itemsSubtotal: itemsSumPhp,
          discount: Math.round(Number(order.discount_amount) || 0),
          giftUsed: Math.round(Number(order.gift_redemption_amount) || 0),
          deliveryFee: deliveryFeePhp,
          paymentMethod: payDisplay,
          paymentAmount: order.payment_amount,
        }}
      />

      {refundPending || cancelRequestPending ? (
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-info-soft p-4" data-cancel-request-pending="1">
          <p className="text-sm text-sam-fg">
            {t(cancelRequestPending ? "mypage_comp_cancel_req_pending_notice" : "mypage_comp_refund_pending_notice")}
          </p>
        </div>
      ) : null}

      {canBuyerCancel ? (
        <div className="rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft p-4">
          <p className="text-sm text-sam-fg">{t("mypage_comp_cancel_allowed_notice")}</p>
          {cancelErr ? <p className="mt-2 text-sm text-sam-danger">{cancelErr}</p> : null}
        </div>
      ) : null}

      {canRefundRequest ? (
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4">
          <h3 className="text-sm font-semibold text-sam-fg">{t("mypage_comp_cancel_req_section_title")}</h3>
          <p className="mt-1 sam-text-helper text-sam-muted">{t("mypage_comp_cancel_req_section_body")}</p>
        </div>
      ) : null}
    </div>

    {/* S31 하단 고정 CTA — 상태별 1주 + 1보조 (본문 중간 버튼·하단 텍스트 링크 대체) */}
    {ctaPrimary ? (
      <MyStickyCta
        dirty
        primary={ctaPrimary}
        secondary={ctaSecondary ?? undefined}
      />
    ) : null}

    <MobileConfirmBottomSheet
      open={cancelConfirmOpen}
      onCancel={() => setCancelConfirmOpen(false)}
      title={t("mypage_oa_cancel_order_confirm_title")}
      description={t("mypage_comp_cancel_before_accept_hint")}
      cancelLabel={t("common_cancel")}
      confirmLabel={t("mypage_comp_cancel_order")}
      confirmTone="danger"
      onConfirm={() => {
        setCancelConfirmOpen(false);
        void cancelGuard.run(() => cancelOrder());
      }}
    />

    <DibayBottomSheet
      open={reasonSheetOpen}
      onClose={() => {
        if (!reasonGuard.pending) setReasonSheetOpen(false);
      }}
      title={t("mypage_comp_cancel_req_section_title")}
      footer={
        <button
          type="button"
          data-testid="store-order-cancel-request-submit"
          /* 포털 시트 — 주문 화면 다크 on-primary 스코프(UI-01)를 버튼에 직접 단다 */
          data-store-orders-surface="mypage"
          disabled={reasonGuard.pending || !isStoreOrderCancelReasonValid(refundReason)}
          onClick={() => void reasonGuard.run(() => requestRefund())}
          /* UI-05: `.sam-btn:disabled` 회색 토큰에 opacity 를 겹치지 않는다 */
          className="sam-btn sam-btn--primary w-full"
        >
          {reasonGuard.pending ? t("mypage_comp_processing") : t("mypage_oa_cancel_request_send")}
        </button>
      }
    >
      <p className="sam-text-helper text-sam-muted">{t("mypage_comp_cancel_req_section_body")}</p>
      <label className="mt-3 block sam-text-helper text-sam-muted">
        {t("mypage_comp_cancel_req_reason_label")}
        <textarea
          className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-base text-sam-fg"
          rows={4}
          maxLength={STORE_ORDER_CANCEL_REASON_MAX}
          value={refundReason}
          onChange={(ev) => setRefundReason(ev.target.value)}
          placeholder={t("mypage_comp_cancel_req_reason_placeholder")}
        />
      </label>
      <p className="mt-1 text-right sam-text-xxs text-sam-meta">
        {refundReason.trim().length}/{STORE_ORDER_CANCEL_REASON_MAX}
      </p>
      {refundErr ? <p className="mt-2 text-sm text-sam-danger">{refundErr}</p> : null}
    </DibayBottomSheet>
    </SupportContextProvider>
  );
}
