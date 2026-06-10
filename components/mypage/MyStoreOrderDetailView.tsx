"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommerceCartHubHeaderRight } from "@/components/layout/CommerceCartHubHeaderRight";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { storeOrderAwaitingFirstPayment } from "@/lib/stores/store-order-awaiting-payment";
import {
  canBuyerRequestStoreRefund,
  isStoreOrderChatDisabledForBuyer,
} from "@/lib/stores/order-status-transitions";
import {
  orderLineOptionsDetailLines,
  orderLineOptionsSummary,
} from "@/lib/stores/product-line-options";
import { formatMoneyPhp } from "@/lib/utils/format";
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
import { StoreOrderReorderAgainButton } from "@/components/mypage/StoreOrderReorderAgainButton";
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
import { useSupabaseStoreOrderRowRealtime } from "@/hooks/useSupabaseStoreOrderRowRealtime";
import { useSupabaseStoreOrderDeliveriesRealtime } from "@/hooks/useSupabaseStoreOrderDeliveriesRealtime";
import {
  buyerFulfillmentLabel,
  buyerReviewProcessLabel,
  buyerStoreOrderProgressCopy,
  formatStoreOrderCheckoutEtaSummaryI18n,
  lineDiscountDisplayI18n,
  paymentMethodLabel,
  storeOrderEventActorLabel,
  storeOrderEventLabels,
} from "@/lib/mypage/store-order-detail-i18n";
import {
  dibayPerfMaybeEmitCustomerStatusAfterOwner,
  dibayPerfOnOrderDetailVisible,
  dibayPerfRecordOrderDetailSeedHydrated,
  dibayPerfRecordOrderDetailSeedUsed,
} from "@/lib/dibay/delivery-flow-perf";

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

function formatPrepClock(iso: string | null | undefined, locale: string): string | null {
  const s = typeof iso === "string" ? iso.trim() : "";
  if (!s) return null;
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function MyStoreOrderDetailView({ ordersHub = false }: { ordersHub?: boolean }) {
  const { t, language } = useI18n();
  const dateLocale = language === "ko" ? "ko-KR" : "en-PH";
  const params = useParams();
  const router = useRouter();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  const listHref = ordersHub ? "/orders" : "/mypage/store-orders";
  const orderBase = ordersHub
    ? `/orders/store/${encodeURIComponent(orderId)}`
    : `/mypage/store-orders/${encodeURIComponent(orderId)}`;
  const reviewHref = `${orderBase}/review`;

  type ViewState =
    | { kind: "loading" }
    | { kind: "seed"; seed: StoreOrderDetailSeed }
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
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const detailPerfOnceRef = useRef<string | null>(null);
  const seedUsedOnceRef = useRef<string | null>(null);

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
            if (prev.kind === "seed" && prev.seed.id === orderId) return prev;
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
        setState((prev) => (prev.kind === "seed" && prev.seed.id === orderId ? prev : { kind: "error", message: "network_error" }));
      }
    }
  }, [orderId]);

  useSupabaseStoreOrderRowRealtime(orderId.trim() || null, {
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

  async function requestRefund() {
    if (!orderId || state.kind !== "ok") return;
    setRefundErr(null);
    setRefundBusy(true);
    try {
      const { json } = await patchMeStoreOrder(orderId, {
        request_refund: true,
        refund_reason: refundReason.trim() || undefined,
      });
      const j = json as { ok?: boolean; error?: string };
      if (!j?.ok) {
        const code = typeof j.error === "string" ? j.error : "refund_request_failed";
        setRefundErr(
          code === "cannot_request_refund"
            ? t("mypage_comp_refund_err_cannot")
            : t("mypage_comp_request_failed_code", { code })
        );
        return;
      }
      await load();
      router.refresh();
    } catch {
      setRefundErr(t("mypage_comp_network_error"));
    } finally {
      setRefundBusy(false);
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
        const code = typeof j.error === "string" ? j.error : "cancel_failed";
        setCancelErr(
          code === "cannot_cancel_after_accepted"
            ? t("mypage_comp_cancel_err_after_accepted")
            : t("mypage_comp_cancel_failed_code", { code })
        );
        return;
      }
      await load();
      router.refresh();
    } catch {
      setCancelErr(t("mypage_comp_network_error"));
    } finally {
      setCancelBusy(false);
    }
  }

  if (state.kind === "loading") {
    return <p className="text-sm text-sam-muted">{t("mypage_comp_loading_short")}</p>;
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
            {buyerOrderStatusLabel(seed.order_status, language)} · {t("mypage_comp_order_payment_amount_label")}{" "}
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
              datetime: new Date(seed.created_at).toLocaleString(dateLocale),
            })}
          </p>
          <p className="mt-4 sam-text-helper text-sam-muted">{t("mypage_comp_order_loading_detail")}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 text-sm text-signature underline"
          >
            {t("mypage_comp_retry")}
          </button>
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
      <div className="space-y-3 text-sm text-sam-muted">
        <p>{t("mypage_comp_order_not_found")}</p>
        <Link href={listHref} className="text-signature underline">
          {t("mypage_comp_back_to_list")}
        </Link>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">{t("mypage_comp_error_wrapped", { message: state.message })}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-signature underline"
        >
          {t("mypage_comp_retry")}
        </button>
      </div>
    );
  }

  const { order, items, review, can_submit_review, orderEvents } = state;
  const reorderItems =
    order.order_status === "completed"
      ? items
          .map((it) => ({
            product_id: String(it.product_id ?? "").trim(),
            product_title_snapshot: it.product_title_snapshot,
            price_snapshot: Math.round(Number(it.price_snapshot) || 0),
            qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
            options_snapshot_json: it.options_snapshot_json,
          }))
          .filter((it) => it.product_id.length > 0)
      : [];
  const reorderPayload: CompletedOrderReorderPayload | null =
    order.order_status === "completed" &&
    String(order.store_slug ?? "").trim() &&
    reorderItems.length > 0
      ? {
          storeId: order.store_id,
          storeSlug: String(order.store_slug).trim(),
          storeName: order.store_name,
          fulfillmentType: order.fulfillment_type,
          items: reorderItems,
        }
      : null;
  const itemsSumPhp = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
  const deliveryFeePhp = Math.max(0, Math.round(Number(order.delivery_fee_amount) || 0));
  const canBuyerCancel = storeOrderAwaitingFirstPayment(order);
  const canRefundRequest = canBuyerRequestStoreRefund(order.order_status, order.payment_status);
  const refundPending = order.order_status === "refund_requested";
  const orderChatDisabled = isStoreOrderChatDisabledForBuyer(order.order_status);
  const payDisplay = formatBuyerPaymentDisplay(order.buyer_payment_method, order.buyer_payment_method_detail);
  const chatHref = `${orderBase}/chat`;
  const orderStatusLabel = (status: string) => buyerOrderStatusLabel(status, language);
  const eventLabels = storeOrderEventLabels(t);
  const prepClock = formatPrepClock(order.estimated_ready_at, dateLocale);
  const buyerProg = buyerStoreOrderProgressCopy(t, order, orderStatusLabel, prepClock);
  const reviewProcess = buyerReviewProcessLabel(t, {
    orderStatus: order.order_status,
    review,
    canSubmitReview: can_submit_review,
  });
  const fulfillLabel = buyerFulfillmentLabel(order.fulfillment_type, t);
  const dash = t("mypage_comp_placeholder_dash");
  const storeProfileImageUrl = order.store_profile_image_url?.trim() || "";

  return (
    <div className="space-y-4">
      <div className="rounded-[4px] border border-[#DDE5E0] bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <SamarketThumbnail
              src={storeProfileImageUrl}
              alt={order.store_name || t("mypage_comp_store_fallback_name")}
              size={44}
              roundedClassName="rounded-full"
              className="bg-[#E4E6EB]"
              fallbackSrc=""
              fallbackNode={
                <div className="text-[11px] font-semibold text-[#6B7280]">
                  {t("mypage_comp_store_fallback_name")}
                </div>
              }
            />
            <div className="min-w-0">
              <p className="truncate sam-text-body font-bold text-[#123B4A]">
                {order.store_name || t("mypage_comp_store_fallback_name")}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-[#6B7280]">{order.order_no}</p>
            </div>
          </div>
        </div>
        <div className="delivery-ui mt-3 rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-primary)] px-3 py-3 text-white">
          {order.admin_locked === true ? (
            <p className="mb-3 rounded-ui-rect border border-violet-200 bg-violet-50 px-3 py-2 sam-text-helper leading-snug text-violet-950">
              {t("mypage_comp_admin_locked_notice")}
            </p>
          ) : null}
          {order.needs_admin_attention === true || (order.sla_warning_level ?? "").trim() ? (
            <p className="mb-3 rounded-ui-rect border border-rose-200 bg-rose-50 px-3 py-2 sam-text-helper leading-snug text-rose-950">
              {t("mypage_comp_sla_delay_notice")}
              {order.sla_warning_reason?.trim() ? (
                <span className="ml-1 text-sam-muted">
                  {t("mypage_comp_sla_reason_suffix", { reason: order.sla_warning_reason.trim() })}
                </span>
              ) : null}
            </p>
          ) : null}
          <p className="sam-text-xxs font-semibold uppercase tracking-[0.08em] text-white/75">
            {t("mypage_comp_order_current_status_heading")}
          </p>
          <p className="mt-1 sam-text-page-title font-bold text-white">{buyerProg.headline}</p>
          {buyerProg.lines.length ? (
            <ul className="mt-2 list-inside list-disc space-y-1 sam-text-helper leading-relaxed text-white/90">
              {buyerProg.lines.map((line, i) => (
                <li key={`${i}:${line}`}>{line}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 sam-text-helper leading-relaxed text-white/75">
            {t("mypage_comp_order_standard_step", {
              status: orderStatusLabel(order.order_status),
              payment: paymentMethodLabel(t, order.payment_status),
            })}
          </p>
          <p className="mt-1 sam-text-xxs leading-relaxed text-white/70">{t("mypage_comp_order_chat_notice")}</p>
        </div>
        <div
          className={`mt-3 rounded-[4px] border px-3 py-3 ${
            reviewProcess.tone === "done"
              ? "border-[#DDE5E0] bg-[#EAF6FB] text-[#123B4A]"
              : reviewProcess.tone === "action"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-[#DDE5E0] bg-[#f6f6f6] text-[#6B7280]"
          }`}
        >
          <p className="text-[12px] font-bold leading-[1.35]">{t("mypage_comp_order_complete_review_heading")}</p>
          <p className="mt-1 text-[13px] font-semibold leading-[1.45]">{reviewProcess.label}</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {orderChatDisabled ? (
            <span className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3 text-sm font-medium text-sam-meta">
              {t("mypage_comp_order_chat_disabled")}
            </span>
          ) : (
            <Link
              href={chatHref}
              className="delivery-ui inline-flex items-center justify-center rounded-[var(--delivery-radius)] border border-[color:var(--delivery-primary)] bg-[color:var(--delivery-primary-soft)] px-3 py-3 text-sm font-bold text-[color:var(--delivery-primary)] shadow-none"
            >
              {t("store_owner_order_progress_chat_title")}
            </Link>
          )}
          {order.store_slug ? (
            <Link
              href={`/stores/${encodeURIComponent(order.store_slug)}`}
              className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-sm font-medium text-sam-fg"
            >
              {t("mypage_comp_view_store")}
            </Link>
          ) : (
            <Link
              href={listHref}
              className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-sm font-medium text-sam-fg"
            >
              {t("mypage_comp_view_order_list")}
            </Link>
          )}
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
              datetime: new Date(order.auto_complete_at).toLocaleString(dateLocale),
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
            datetime: new Date(order.created_at).toLocaleString(dateLocale),
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
                      {new Date(ev.created_at).toLocaleString(dateLocale)}
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
                <p className="text-amber-800">{t("mypage_comp_store_address_missing")}</p>
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
            <p className="mt-1.5 text-sm text-amber-800">{t("mypage_comp_delivery_address_missing")}</p>
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
              <div className="flex justify-between gap-3 text-sam-fg">
                <span>{t("mypage_comp_order_discount")}</span>
                <span className="font-medium text-red-600">
                  −{formatMoneyPhp(Math.round(Number(order.discount_amount) || 0))}
                </span>
              </div>
            ) : null}
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

        <div className="mt-4 border-t border-sam-border-soft pt-4">
          <h3 className="sam-text-xxs font-semibold text-sam-muted">{t("mypage_comp_payment_method_section")}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-sam-fg">
            {paymentMethodLabel(t, order.payment_status)}
          </p>
        </div>
      </div>

      {order.order_status === "completed" && reorderPayload ? (
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
          <StoreOrderReorderAgainButton
            payload={reorderPayload}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-ui-rect border border-signature/40 bg-sam-surface px-3 py-3 text-sm font-semibold text-signature shadow-sm"
          />
        </div>
      ) : null}

      {refundPending ? (
        <div className="rounded-ui-rect border border-blue-100 bg-blue-50/80 p-4">
          <p className="text-sm text-blue-950">{t("mypage_comp_refund_pending_notice")}</p>
        </div>
      ) : null}

      {canRefundRequest ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-sam-fg">{t("mypage_comp_refund_section_title")}</h3>
          <p className="mt-1 sam-text-helper text-sam-muted">{t("mypage_comp_refund_section_body")}</p>
          <label className="mt-3 block sam-text-helper text-sam-muted">
            {t("mypage_comp_refund_reason_label")}
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm text-sam-fg"
              rows={3}
              maxLength={500}
              value={refundReason}
              onChange={(ev) => setRefundReason(ev.target.value)}
              placeholder={t("mypage_comp_refund_reason_placeholder")}
            />
          </label>
          {refundErr ? <p className="mt-2 text-sm text-red-600">{refundErr}</p> : null}
          <button
            type="button"
            disabled={refundBusy}
            onClick={() => void requestRefund()}
            className="mt-3 w-full rounded-ui-rect border border-sam-border bg-sam-app py-2.5 text-sm font-medium text-sam-fg disabled:opacity-50"
          >
            {refundBusy ? t("mypage_comp_processing") : t("mypage_comp_refund_submit")}
          </button>
        </div>
      ) : null}

      {canBuyerCancel ? (
        <div className="rounded-ui-rect border border-amber-100 bg-amber-50/80 p-4">
          <p className="text-sm text-amber-950">{t("mypage_comp_cancel_allowed_notice")}</p>
          {cancelErr ? <p className="mt-2 text-sm text-red-600">{cancelErr}</p> : null}
          <button
            type="button"
            disabled={cancelBusy}
            onClick={() => void cancelOrder()}
            className="mt-3 w-full rounded-ui-rect border border-red-200 bg-sam-surface py-2.5 text-sm font-medium text-red-700 disabled:opacity-50"
          >
            {cancelBusy ? t("mypage_comp_processing") : t("mypage_comp_cancel_order")}
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        {!orderChatDisabled ? (
          <Link href={chatHref} className="block text-center text-sm text-signature underline">
            {t("mypage_comp_order_chat_nav")}
          </Link>
        ) : null}
        <Link href={listHref} className="block text-center text-sm text-signature underline">
          {t("mypage_comp_back_to_list_full")}
        </Link>
      </div>
    </div>
  );
}
