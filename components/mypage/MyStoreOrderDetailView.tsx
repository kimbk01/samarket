"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import type { CompletedOrderReorderPayload } from "@/lib/stores/apply-completed-order-to-commerce-cart";
import { StoreOrderReorderAgainButton } from "@/components/mypage/StoreOrderReorderAgainButton";
import { BuyerStoreOrderCompletedReviewBlock } from "@/components/mypage/BuyerStoreOrderCompletedReviewBlock";
import type { BuyerStoreOrderReviewSummary } from "@/lib/stores/buyer-store-order-review-meta";
import { StoreOrderMessengerDeepLink } from "@/components/stores/StoreOrderMessengerDeepLink";
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
import { formatStoreOrderCheckoutEtaSummary } from "@/lib/stores/format-store-order-checkout-display";
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

const STORE_ORDER_EVENT_LABEL_KO: Record<string, string> = {
  order_created: "주문 생성",
  order_accepted: "매장 접수",
  order_rejected: "접수 거절",
  order_preparing: "준비(조리)중",
  order_ready: "준비(조리)중",
  order_delivering: "배달중",
  order_completed: "배달완료",
  order_cancelled: "취소",
  refund_requested: "환불 요청",
  refund_approved: "환불 처리",
  refund_rejected: "환불 거절",
  system_note: "안내",
  delivery_status_changed: "배달 진행",
  order_payment_completed_buyer: "결제 완료",
  order_payment_completed_owner: "매장 결제 확인",
  order_payment_failed_buyer: "결제 실패",
};

function storeOrderEventActorLabelKo(role: string): string {
  switch (role) {
    case "buyer":
      return "구매자";
    case "owner":
      return "매장";
    case "rider":
      return "라이더";
    case "admin":
      return "운영";
    case "system":
      return "시스템";
    default:
      return role;
  }
}

type OrderDetail = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  store_slug: string;
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


const FULFILL_LABEL: Record<string, string> = {
  pickup: "포장 픽업",
  local_delivery: "배달",
  shipping: "배달",
};

const ORDER_LABEL: Record<string, string> = { ...BUYER_ORDER_STATUS_LABEL };

function formatPrepClockKo(iso: string | null | undefined): string | null {
  const s = typeof iso === "string" ? iso.trim() : "";
  if (!s) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buyerStoreOrderProgressCopy(order: OrderDetail): { headline: string; lines: string[] } {
  const clock = formatPrepClockKo(order.estimated_ready_at);
  const n = Math.max(0, Math.floor(Number(order.estimated_prep_minutes) || 0));
  const d = order.delivery;
  const deliveryLine = (() => {
    const s = d?.delivery_status?.trim?.() ? String(d.delivery_status).trim() : "";
    if (!s) return null;
    switch (s) {
      case "waiting_rider":
        return "배차 대기중";
      case "rider_assigned":
        return "라이더 배정됨";
      case "pickup_in_progress":
        return "픽업 진행중";
      case "delivering":
        return "배달중";
      case "delivered":
        return "배달 완료";
      case "delivery_failed":
        return "배송 실패(운영 확인중)";
      default:
        return `배송 상태: ${s}`;
    }
  })();

  switch (order.order_status) {
    case "pending":
      return {
        headline: "매장 접수 대기중",
        lines: ["매장에서 주문을 확인하면 진행 안내를 바로 보여 드릴게요."],
      };
    case "accepted":
      return {
        headline: "매장이 주문을 확인했습니다",
        lines: [
          n > 0 ? `예상 준비시간: 약 ${n}분` : "예상 준비시간은 매장 안내를 참고해 주세요.",
          clock ? `예상 준비완료: ${clock}` : "",
        ].filter(Boolean),
      };
    case "preparing":
      return {
        headline: "준비(조리)중",
        lines: clock ? [`예상 준비완료 ${clock}`] : ["매장에서 준비 중입니다."],
      };
    case "delivering":
      return {
        headline: "배달중",
        lines:
          [
            deliveryLine,
            typeof d?.customer_arrived_at === "string" && d.customer_arrived_at.trim()
              ? "라이더가 배달지에 도착했습니다."
              : null,
            order.delivery_courier_label?.trim() ? `배달 정보: ${order.delivery_courier_label.trim()}` : null,
          ].filter((x): x is string => typeof x === "string" && x.length > 0),
      };
    default: {
      const lines: string[] = [];
      if (order.order_status === "completed" && order.delivery?.delivery_status === "delivered") {
        const dc =
          typeof order.delivery.delivered_confirmed_at === "string" && order.delivery.delivered_confirmed_at.trim();
        if (dc) lines.push("배달 완료 확인이 접수되었습니다.");
        const hint =
          typeof order.delivery.delivered_receiver_hint === "string" &&
          order.delivery.delivered_receiver_hint.trim();
        if (hint) lines.push(`수령 확인: ${hint}`);
      }
      if (deliveryLine) lines.push(deliveryLine);
      return {
        headline: ORDER_LABEL[order.order_status] ?? order.order_status,
        lines,
      };
    }
  }
}

function paymentMethodLabel(paymentStatus: string): string {
  switch (paymentStatus) {
    case "paid":
      return "배달 주문 · 결제 완료(현장·직접 정산)";
    case "pending":
      return "결제 대기";
    case "failed":
      return "결제 실패";
    case "cancelled":
      return "결제 취소";
    case "refunded":
      return "환불 처리됨";
    default:
      return paymentStatus;
  }
}

function buyerReviewProcessLabel(args: {
  orderStatus: string;
  review: BuyerStoreOrderReviewSummary | null;
  canSubmitReview: boolean;
}): { label: string; tone: "done" | "action" | "muted" } {
  if (args.orderStatus !== "completed") return { label: "주문 완료 후 리뷰를 남길 수 있습니다.", tone: "muted" };
  if (args.review) return { label: "리뷰 작성이 완료되었습니다.", tone: "done" };
  if (args.canSubmitReview) return { label: "주문이 완료되었습니다. 리뷰를 작성해 주세요.", tone: "action" };
  return { label: "리뷰 상태를 확인 중입니다.", tone: "muted" };
}

function lineDiscountDisplay(priceSnapshot: number, qty: number, subtotal: number): string {
  const gross = Math.round(priceSnapshot) * qty;
  const st = Math.round(subtotal);
  if (gross <= 0) return "—";
  if (st >= gross) return "—";
  const off = gross - st;
  const pct = Math.round((off / gross) * 1000) / 10;
  return `${pct}% (−${formatMoneyPhp(off)})`;
}

export function MyStoreOrderDetailView({ ordersHub = false }: { ordersHub?: boolean }) {
  const params = useParams();
  const router = useRouter();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  const listHref = ordersHub ? "/orders?tab=store" : "/mypage/store-orders";
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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
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
        fetchMeStoreOrderDetailDeduped(orderId),
        fetchMeStoreOrderEventsDeduped(orderId),
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
    onChange: () => void load({ silent: true }),
  });

  useSupabaseStoreOrderDeliveriesRealtime(
    orderId.trim() ? { kind: "order", orderId } : null,
    { debounceMs: 420, onChange: () => void load({ silent: true }) }
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
            ? "이 단계에서는 환불 요청을 할 수 없습니다. (완료된 주문은 고객센터로 문의해 주세요.)"
            : `요청에 실패했습니다. (${code})`
        );
        return;
      }
      await load();
      router.refresh();
    } catch {
      setRefundErr("네트워크 오류가 발생했습니다.");
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
            ? "매장이 접수한 뒤에는 여기서 취소할 수 없습니다. 매장에 문의해 주세요."
            : `취소에 실패했습니다. (${code})`
        );
        return;
      }
      await load();
      router.refresh();
    } catch {
      setCancelErr("네트워크 오류가 발생했습니다.");
    } finally {
      setCancelBusy(false);
    }
  }

  if (state.kind === "loading") {
    return <p className="text-sm text-sam-muted">불러오는 중…</p>;
  }
  if (state.kind === "seed") {
    const seed = state.seed;
    return (
      <div className="space-y-4">
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="sam-text-body font-semibold text-sam-fg">{seed.store_name || "매장"}</p>
            <span className="text-xs text-sam-meta">{seed.order_no}</span>
          </div>
          <p className="mt-3 sam-text-helper text-sam-fg">
            {ORDER_LABEL[seed.order_status] ?? seed.order_status} · 결제 금액{" "}
            <span className="font-semibold">{formatMoneyPhp(seed.payment_amount)}</span>
            {seed.total_amount !== seed.payment_amount ? (
              <span className="text-sam-muted">
                {" "}
                (합계 {formatMoneyPhp(seed.total_amount)})
              </span>
            ) : null}
          </p>
          <p className="mt-2 sam-text-xxs text-sam-muted">
            주문일 {new Date(seed.created_at).toLocaleString("ko-KR")}
          </p>
          <p className="mt-4 sam-text-helper text-sam-muted">주문 정보를 불러오는 중…</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 text-sm text-signature underline"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }
  if (state.kind === "unauth") {
    return (
      <div className="space-y-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 text-sm text-sam-muted shadow-sm">
        <p>로그인 후 주문 상세와 매장 채팅을 계속 확인할 수 있습니다.</p>
        <Link
          href="/login"
          className="inline-flex rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white"
        >
          로그인하고 주문 이어보기
        </Link>
      </div>
    );
  }
  if (state.kind === "not_found") {
    return (
      <div className="space-y-3 text-sm text-sam-muted">
        <p>주문을 찾을 수 없습니다.</p>
        <Link href={listHref} className="text-signature underline">
          목록으로
        </Link>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">({state.message})</p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-signature underline"
        >
          다시 시도
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
  const buyerProg = buyerStoreOrderProgressCopy(order);
  const reviewProcess = buyerReviewProcessLabel({
    orderStatus: order.order_status,
    review,
    canSubmitReview: can_submit_review,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-[4px] border border-[#DDE5E0] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <p className="sam-text-body font-bold text-[#123B4A]">
            {order.store_name || "매장"}
          </p>
          <span className="text-xs font-semibold text-[#6B7280]">{order.order_no}</span>
        </div>
        <div className="mt-3 rounded-[4px] border border-[#DDE5E0] bg-[#1C8DB8] px-3 py-3 text-white">
          {order.admin_locked === true ? (
            <p className="mb-3 rounded-ui-rect border border-violet-200 bg-violet-50 px-3 py-2 sam-text-helper leading-snug text-violet-950">
              이 주문은 플랫폼 운영에서 일시적으로 보호 중입니다. 취소·환불 요청 변경은 운영 정책에 따라 처리됩니다.
            </p>
          ) : null}
          {order.needs_admin_attention === true || (order.sla_warning_level ?? "").trim() ? (
            <p className="mb-3 rounded-ui-rect border border-rose-200 bg-rose-50 px-3 py-2 sam-text-helper leading-snug text-rose-950">
              배달 진행이 지연되고 있어요. 운영에서 확인 중입니다.
              {order.sla_warning_reason?.trim() ? (
                <span className="ml-1 text-sam-muted">(사유: {order.sla_warning_reason.trim()})</span>
              ) : null}
            </p>
          ) : null}
          <p className="sam-text-xxs font-semibold uppercase tracking-[0.08em] text-white/75">
            현재 주문 상태
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
            표준 단계: {ORDER_LABEL[order.order_status] ?? order.order_status} · 결제{" "}
            {paymentMethodLabel(order.payment_status)}
          </p>
          <p className="mt-1 sam-text-xxs leading-relaxed text-white/70">
            주문 채팅은 매장과 소통용이며, 취소·환불 처리 상태는 이 화면에서 확인하세요.
          </p>
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
          <p className="text-[12px] font-bold leading-[1.35]">주문 완료 리뷰</p>
          <p className="mt-1 text-[13px] font-semibold leading-[1.45]">{reviewProcess.label}</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {orderChatDisabled ? (
            <span className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3 text-sm font-medium text-sam-meta">
              주문 채팅 불가
            </span>
          ) : (
            <Link
              href={chatHref}
              className="inline-flex items-center justify-center rounded-[4px] border border-[#1C8DB8] bg-[#EAF6FB] px-3 py-3 text-sm font-bold text-[#1C8DB8] shadow-sm"
            >
              주문 진행 채팅
            </Link>
          )}
          {order.store_slug ? (
            <Link
              href={`/stores/${encodeURIComponent(order.store_slug)}`}
              className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-sm font-medium text-sam-fg"
            >
              매장 보기
            </Link>
          ) : (
            <Link
              href={listHref}
              className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-sm font-medium text-sam-fg"
            >
              주문 목록 보기
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
                thumbnailUrl: null,
              })}
            />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-sam-muted">
          {FULFILL_LABEL[order.fulfillment_type] ?? order.fulfillment_type}
          {" · "}
          {ORDER_LABEL[order.order_status] ?? order.order_status}
        </p>
        {(order.order_status === "ready_for_pickup" ||
          order.order_status === "delivering" ||
          order.order_status === "arrived") &&
        order.auto_complete_at ? (
          <p className="mt-2 sam-text-xxs text-sam-muted">
            아래 시각이 지나면 주문이 자동으로 &quot;완료&quot; 처리될 수 있습니다.{" "}
            <span className="font-medium text-sam-fg">
              {new Date(order.auto_complete_at).toLocaleString("ko-KR")}
            </span>
          </p>
        ) : null}
        {storeOrderAwaitingFirstPayment(order) ? (
          <p className="mt-3 sam-text-xxs text-sam-muted">
            매장이 접수하기 전이면 아래에서 주문을 취소할 수 있습니다. 금액 정산은 매장과 직접 하시면 됩니다.
          </p>
        ) : null}
        {payDisplay !== "—" ? (
          <p className="mt-2 text-sm font-medium text-sam-fg">결제 방법: {payDisplay}</p>
        ) : null}
        {order.buyer_note ? (
          <p className="mt-2 text-sm text-sam-fg">요청 사항: {order.buyer_note}</p>
        ) : null}
        <p className="mt-2 sam-text-xxs text-sam-meta">
          주문일 {new Date(order.created_at).toLocaleString("ko-KR")}
        </p>
      </div>

      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-sam-fg">진행 단계</h2>
        {order.order_status === "pending" ? (
          <p className="mt-2 rounded-ui-rect bg-signature/5 px-3 py-2 sam-text-helper text-sam-fg">
            매장에서 주문을 확인·접수하면 채팅과 알림으로 다음 단계를 알려드려요.
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-sam-meta">주문 기록</h3>
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
                      {STORE_ORDER_EVENT_LABEL_KO[ev.event_type] ?? ev.event_type}
                      {autoCompleteCron ? " · 자동 구매확정" : ""}
                    </span>
                    <span className="text-sam-meta">
                      {new Date(ev.created_at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <p className="mt-1 text-sam-meta">
                    {storeOrderEventActorLabelKo(ev.actor_role)}
                    {ev.from_status || ev.to_status
                      ? ` · ${ev.from_status ?? "—"} → ${ev.to_status ?? "—"}`
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
        <h2 className="sam-text-body font-bold text-sam-fg">주문 상품</h2>

        <div className="mt-4">
          <h3 className="sam-text-xxs font-semibold text-sam-muted">
            {order.fulfillment_type === "pickup" ? "픽업 장소 (매장 주소)" : "배달 받을 주소"}
          </h3>
          {order.fulfillment_type === "pickup" ? (
            <div className="mt-1.5 space-y-1 text-sm leading-relaxed text-sam-fg">
              <p className="sam-text-body-secondary text-sam-muted">포장 픽업 · 아래 매장에서 수령하세요.</p>
              {order.store_pickup_address_lines && order.store_pickup_address_lines.length > 0 ? (
                order.store_pickup_address_lines.map((line, i) => (
                  <p key={i} className={i === 0 ? "font-medium text-sam-fg" : "sam-text-body-secondary text-sam-fg"}>
                    {line}
                  </p>
                ))
              ) : (
                <p className="text-amber-800">매장 주소가 아직 등록되지 않았습니다. 채팅으로 매장에 확인해 주세요.</p>
              )}
              {order.store_slug ?
                <Link
                  href={`/stores/${encodeURIComponent(order.store_slug)}/info`}
                  className="mt-2 inline-block sam-text-body-secondary font-medium text-signature underline"
                >
                  매장 정보 보기
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
                const line = formatStoreOrderCheckoutEtaSummary({
                  checkout_eta_minutes: order.checkout_eta_minutes,
                  checkout_route_distance_meters: order.checkout_route_distance_meters,
                });
                return line ?
                    <p
                      className="mt-2 sam-text-body-secondary text-sam-muted"
                      title="주소·매장 위치 변경 시 자동 갱신된 참고 값입니다."
                    >
                      {line}
                    </p>
                  : null;
              })()}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-amber-800">등록된 배달 주소가 없습니다.</p>
          )}
        </div>

        <div className="mt-4 border-t border-sam-border-soft pt-4">
          <h3 className="sam-text-xxs font-semibold text-sam-muted">주문자 연락처</h3>
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
              <span className="ml-1 sam-text-xxs font-normal text-sam-meta">· 전화 문의</span>
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-sam-muted">등록된 연락처가 없습니다.</p>
          )}
        </div>

        <div className="mt-4 border-t border-sam-border-soft pt-4">
          <h3 className="sam-text-xxs font-semibold text-sam-muted">주문 품목</h3>
          <p className="mt-1 sam-text-xxs text-sam-meta">이름 · 수량 · 단가 / 할인율 · 항목 합계</p>
          <ul className="mt-3 space-y-3 text-sm text-sam-fg">
            {items.map((it) => {
              const optSum = orderLineOptionsSummary(it.options_snapshot_json);
              const optLines = orderLineOptionsDetailLines(it.options_snapshot_json);
              const ps = Number(it.price_snapshot) || 0;
              const q = Number(it.qty) || 0;
              const st = Number(it.subtotal) || 0;
              const disc = lineDiscountDisplay(ps, q, st);
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
                      단가 <span className="font-medium text-sam-fg">{formatMoneyPhp(ps)}</span>
                    </span>
                    <span>
                      할인율{" "}
                      <span className="font-medium text-sam-fg">{disc}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-sam-border/80 pt-2 text-sm">
                    <span className="text-sam-muted">항목 합계</span>
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
          <h3 className="sam-text-xxs font-semibold text-sam-muted">금액</h3>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3 text-sam-fg">
              <span>상품 소계</span>
              <span className="font-medium text-sam-fg">{formatMoneyPhp(itemsSumPhp)}</span>
            </div>
            {Math.round(Number(order.discount_amount) || 0) > 0 ? (
              <div className="flex justify-between gap-3 text-sam-fg">
                <span>주문 할인</span>
                <span className="font-medium text-red-600">
                  −{formatMoneyPhp(Math.round(Number(order.discount_amount) || 0))}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 text-sam-fg">
              <span>배달비</span>
              <span className="font-medium text-sam-fg">
                {deliveryFeePhp > 0 ? formatMoneyPhp(deliveryFeePhp) : "₱0"}
              </span>
            </div>
            {order.delivery_courier_label?.trim() && deliveryFeePhp > 0 ? (
              <p className="sam-text-xxs leading-snug text-sam-muted">
                배달 업체(안내): {order.delivery_courier_label.trim()} · 안내 목적이며 청구 금액과 다를 수 있음
              </p>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-sam-border pt-2 text-base font-bold text-sam-fg">
              <span>총액</span>
              <span>{formatMoneyPhp(order.payment_amount)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-sam-border-soft pt-4">
          <h3 className="sam-text-xxs font-semibold text-sam-muted">결제 방법</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-sam-fg">{paymentMethodLabel(order.payment_status)}</p>
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
          <p className="text-sm text-blue-950">
            환불 요청이 접수되었습니다. 매장·운영 확인 후 처리됩니다. 실제 금액 반환은 매장과 직접 조율하면
            됩니다.
          </p>
        </div>
      ) : null}

      {canRefundRequest ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-sam-fg">환불 요청</h3>
          <p className="mt-1 sam-text-helper text-sam-muted">
            매장이 이미 접수한 주문입니다. 환불이 필요하면 아래에서 요청해 주세요. 승인 시 재고는 자동으로
            되돌아갑니다.
          </p>
          <label className="mt-3 block sam-text-helper text-sam-muted">
            사유 (선택, 최대 500자)
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm text-sam-fg"
              rows={3}
              maxLength={500}
              value={refundReason}
              onChange={(ev) => setRefundReason(ev.target.value)}
              placeholder="예: 단순 변심, 배송 지연 등"
            />
          </label>
          {refundErr ? <p className="mt-2 text-sm text-red-600">{refundErr}</p> : null}
          <button
            type="button"
            disabled={refundBusy}
            onClick={() => void requestRefund()}
            className="mt-3 w-full rounded-ui-rect border border-sam-border bg-sam-app py-2.5 text-sm font-medium text-sam-fg disabled:opacity-50"
          >
            {refundBusy ? "처리 중…" : "환불 요청하기"}
          </button>
        </div>
      ) : null}

      {canBuyerCancel ? (
        <div className="rounded-ui-rect border border-amber-100 bg-amber-50/80 p-4">
          <p className="text-sm text-amber-950">
            매장이 아직 접수하지 않았다면 주문을 취소할 수 있습니다. 취소 시 상품 재고가 되돌아갑니다.
          </p>
          {cancelErr ? <p className="mt-2 text-sm text-red-600">{cancelErr}</p> : null}
          <button
            type="button"
            disabled={cancelBusy}
            onClick={() => void cancelOrder()}
            className="mt-3 w-full rounded-ui-rect border border-red-200 bg-sam-surface py-2.5 text-sm font-medium text-red-700 disabled:opacity-50"
          >
            {cancelBusy ? "처리 중…" : "주문 취소"}
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        {!orderChatDisabled ? (
          <Link href={chatHref} className="block text-center text-sm text-signature underline">
            주문 채팅으로 이동
          </Link>
        ) : null}
        <Link href={listHref} className="block text-center text-sm text-signature underline">
          목록으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
