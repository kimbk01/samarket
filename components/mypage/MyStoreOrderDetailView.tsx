"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
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
import { StoreCommerceOrderTimeline } from "@/components/stores/StoreCommerceOrderTimeline";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import type { CompletedOrderReorderPayload } from "@/lib/stores/apply-completed-order-to-commerce-cart";
import { StoreOrderReorderAgainButton } from "@/components/mypage/StoreOrderReorderAgainButton";
import { StoreOrderMessengerDeepLink } from "@/components/stores/StoreOrderMessengerDeepLink";
import { buildMessengerContextInputFromStoreOrderSnapshot } from "@/lib/community-messenger/store-order-messenger-context";
import { fetchMeStoreOrderDetailDeduped, patchMeStoreOrder } from "@/lib/stores/store-delivery-api-client";

type ItemRow = {
  id: string;
  product_id: string;
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  subtotal: number;
  options_snapshot_json?: unknown;
};

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
};


const FULFILL_LABEL: Record<string, string> = {
  pickup: "포장 픽업",
  local_delivery: "배달",
  shipping: "배달",
};

const ORDER_LABEL: Record<string, string> = { ...BUYER_ORDER_STATUS_LABEL };

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

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unauth" }
    | { kind: "not_found" }
    | { kind: "error"; message: string }
    | {
        kind: "ok";
        order: OrderDetail;
        items: ItemRow[];
        review: { id: string; visible_to_public?: boolean } | null;
        can_submit_review: boolean;
      }
  >({ kind: "loading" });
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!orderId) {
      if (!silent) setState({ kind: "not_found" });
      return;
    }
    if (!silent) setState({ kind: "loading" });
    try {
      const { status, json } = await fetchMeStoreOrderDetailDeduped(orderId);
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
        if (!silent) setState({ kind: "not_found" });
        return;
      }
      if (!data?.ok) {
        if (!silent) {
          setState({
            kind: "error",
            message: typeof data?.error === "string" ? data.error : "load_failed",
          });
        }
        return;
      }
      setState({
        kind: "ok",
        order: data.order as OrderDetail,
        items: (data.items ?? []) as ItemRow[],
        review: (data.review ?? null) as { id: string } | null,
        can_submit_review: !!data.can_submit_review,
      });
    } catch {
      if (!silent) setState({ kind: "error", message: "network_error" });
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

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

  const { order, items, review, can_submit_review } = state;
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

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <p className="sam-text-body font-semibold text-sam-fg">
            {order.store_name || "매장"}
          </p>
          <span className="text-xs text-sam-meta">{order.order_no}</span>
        </div>
        <div className="mt-3 rounded-ui-rect border border-sam-border bg-signature/5/80 px-3 py-3">
          <p className="sam-text-xxs font-semibold uppercase tracking-[0.08em] text-signature">
            현재 주문 상태
          </p>
          <p className="mt-1 sam-text-page-title font-bold text-sam-fg">
            {ORDER_LABEL[order.order_status] ?? order.order_status}
          </p>
          <p className="mt-1 sam-text-helper leading-relaxed text-sam-muted">
            결제 {paymentMethodLabel(order.payment_status)} · 주문 채팅은 매장과 소통용이며, 취소·환불 처리 상태는 이
            화면에서 계속 확인하세요.
          </p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {orderChatDisabled ? (
            <span className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3 text-sm font-medium text-sam-meta">
              주문 채팅 불가
            </span>
          ) : (
            <Link
              href={chatHref}
              className="inline-flex items-center justify-center rounded-ui-rect border border-signature bg-sam-surface px-3 py-3 text-sm font-semibold text-signature shadow-sm"
            >
              주문 채팅
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
                storeName: order.store_name,
                orderNo: order.order_no,
                fulfillmentType: order.fulfillment_type,
                orderStatus: order.order_status,
                paymentAmount: order.payment_amount,
                firstLineProductTitle: items[0]?.product_title_snapshot ?? null,
                thumbnailUrl: null,
              })}
            />
          </div>
        ) : null}
        {order.order_status === "completed" && reorderPayload ? (
          <div className="mt-3 flex flex-row gap-2">
            {!review && can_submit_review ? (
              <Link
                href={reviewHref}
                className="inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-ui-rect border border-amber-200 bg-amber-50 px-2 py-3 text-sm font-semibold text-amber-900"
              >
                리뷰 작성으로 이어가기
              </Link>
            ) : null}
            <StoreOrderReorderAgainButton
              payload={reorderPayload}
              className="inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-ui-rect border border-signature/40 bg-sam-surface px-2 py-3 text-sm font-semibold text-signature shadow-sm"
            />
          </div>
        ) : order.order_status === "completed" && !review && can_submit_review ? (
          <div className="mt-3">
            <Link
              href={reviewHref}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-900"
            >
              리뷰 작성으로 이어가기
            </Link>
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
          ) : order.delivery_address_summary?.trim() ? (
            <div className="mt-1.5 space-y-1 text-sm leading-relaxed text-sam-fg">
              <p>{order.delivery_address_summary.trim()}</p>
              {order.delivery_address_detail?.trim() ? (
                <p className="sam-text-body-secondary text-sam-muted">{order.delivery_address_detail.trim()}</p>
              ) : null}
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

      {order.order_status === "completed" ? (
        <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
          {review ? (
            <>
              <p className="text-sm text-sam-muted">
                {review.visible_to_public === false
                  ? "리뷰를 등록했습니다. 사장님에게만 공유된 글로, 다른 고객이 보는 매장 리뷰 목록에는 나오지 않을 수 있어요."
                  : "리뷰를 등록했습니다. 매장 페이지 리뷰 목록에 노출될 수 있어요."}
              </p>
              {!orderChatDisabled ? (
                <Link
                  href={chatHref}
                  className="mt-3 block w-full rounded-ui-rect border border-sam-border bg-sam-surface py-3 text-center text-sm font-medium text-sam-fg"
                >
                  주문 채팅 다시 보기
                </Link>
              ) : null}
            </>
          ) : can_submit_review ? (
            <div className="space-y-3">
              <p className="text-sm text-sam-muted">
                주문이 완료되었습니다. 필요하면 채팅 내용을 다시 확인한 뒤 후기를 남겨 주세요.
              </p>
              {!orderChatDisabled ? (
                <Link
                  href={chatHref}
                  className="block w-full rounded-ui-rect border border-sam-border bg-sam-surface py-3 text-center text-sm font-medium text-sam-fg"
                >
                  주문 채팅 보기
                </Link>
              ) : null}
              {reorderPayload ? (
                <div className="flex flex-row gap-2">
                  <Link
                    href={reviewHref}
                    className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-ui-rect bg-signature px-2 py-3 text-center text-sm font-semibold text-white"
                  >
                    리뷰 작성하기
                  </Link>
                  <StoreOrderReorderAgainButton
                    payload={reorderPayload}
                    className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-ui-rect border border-signature/40 bg-sam-surface px-2 py-3 text-sm font-semibold text-signature shadow-sm"
                  />
                </div>
              ) : (
                <Link
                  href={reviewHref}
                  className="block w-full rounded-ui-rect bg-signature py-3 text-center text-sm font-semibold text-white"
                >
                  리뷰 작성하기
                </Link>
              )}
            </div>
          ) : (
            <p className="text-sm text-sam-muted">
              리뷰를 등록할 수 없습니다. (DB 미적용이거나 일시 오류일 수 있습니다.)
            </p>
          )}
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
