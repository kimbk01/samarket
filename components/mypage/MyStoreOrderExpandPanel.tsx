"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreOrderDeliveryAddressDisplay } from "@/components/addresses/StoreOrderDeliveryAddressDisplay";
import { StoreCommerceOrderTimeline } from "@/components/stores/StoreCommerceOrderTimeline";
import { storeOrderAwaitingFirstPayment } from "@/lib/stores/store-order-awaiting-payment";
import { canBuyerRequestStoreRefund } from "@/lib/stores/order-status-transitions";
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
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import {
  fetchMeStoreOrderDetailDeduped,
  fetchMeStoreOrderEventsDeduped,
  patchMeStoreOrder,
  peekMeStoreOrderDetailCache,
  peekMeStoreOrderEventsCache,
} from "@/lib/stores/store-delivery-api-client";
import { useCustomerStoreOrderRowRealtime } from "@/hooks/delivery-customer/useCustomerStoreOrderRowRealtime";
import { useSupabaseStoreOrderDeliveriesRealtime } from "@/hooks/useSupabaseStoreOrderDeliveriesRealtime";
import {
  buyerStoreOrderProgressCopy,
  lineDiscountDisplayI18n,
  storeOrderEventLabels,
} from "@/lib/mypage/store-order-detail-i18n";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";

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
  store_pickup_address_lines?: string[];
  created_at: string;
  auto_complete_at?: string | null;
  estimated_ready_at?: string | null;
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

/** 목록 row — 펼침 직후 즉시 메뉴·금액 표시용 */
export type BuyerStoreOrderExpandListSeed = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  store_slug?: string;
  total_amount: number;
  payment_amount: number;
  discount_amount?: number;
  payment_status?: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note?: string | null;
  created_at: string;
  items?: {
    id?: string;
    product_id?: string;
    product_title_snapshot: string;
    price_snapshot?: number;
    qty: number;
    subtotal?: number;
    options_snapshot_json?: unknown;
  }[];
};

const ACTIVE_STATUSES = new Set([
  "pending",
  "accepted",
  "preparing",
  "delivering",
  "ready_for_pickup",
  "arrived",
]);

type PanelState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      order: OrderDetail;
      items: ItemRow[];
      orderEvents?: StoreOrderEventPublic[];
      /** 목록 seed만 있을 때 주소·연락처 등 보강 중 */
      hydratingDetail?: boolean;
    };

function parseEventsFromResponse(eventsRes: { status: number; json: unknown }): StoreOrderEventPublic[] | undefined {
  if (eventsRes.status !== 200) return undefined;
  const ej = eventsRes.json as { ok?: boolean; events?: unknown };
  if (ej?.ok !== true || !Array.isArray(ej.events)) return undefined;
  return ej.events as StoreOrderEventPublic[];
}

function parseDetailFromResponse(detailRes: {
  status: number;
  json: unknown;
}): { order: OrderDetail; items: ItemRow[] } | null {
  const data = detailRes.json as {
    ok?: boolean;
    order?: OrderDetail;
    items?: ItemRow[];
  };
  if (detailRes.status === 404 || !data?.ok || !data.order) return null;
  return {
    order: data.order as OrderDetail,
    items: (data.items ?? []) as ItemRow[],
  };
}

function panelStateFromCaches(orderId: string): PanelState | null {
  const detailHit = peekMeStoreOrderDetailCache(orderId);
  if (!detailHit) return null;
  const parsed = parseDetailFromResponse(detailHit);
  if (!parsed) return null;
  const eventsHit = peekMeStoreOrderEventsCache(orderId);
  const orderEvents = eventsHit ? parseEventsFromResponse(eventsHit) : undefined;
  return {
    kind: "ok",
    order: parsed.order,
    items: parsed.items,
    orderEvents,
    hydratingDetail: false,
  };
}

function mapListSeedItems(seed: BuyerStoreOrderExpandListSeed): ItemRow[] {
  return (seed.items ?? []).map((it, index) => {
    const price = Math.round(Number(it.price_snapshot) || 0);
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    const subtotal =
      typeof it.subtotal === "number" && Number.isFinite(it.subtotal) ?
        Math.round(it.subtotal)
      : price * qty;
    return {
      id: String(it.id ?? `seed-${index}`),
      product_id: String(it.product_id ?? ""),
      product_title_snapshot: it.product_title_snapshot,
      price_snapshot: price,
      qty,
      subtotal,
      options_snapshot_json: it.options_snapshot_json,
    };
  });
}

function panelStateFromListSeed(seed: BuyerStoreOrderExpandListSeed): PanelState {
  const items = mapListSeedItems(seed);
  const itemsSum = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
  return {
    kind: "ok",
    order: {
      id: seed.id,
      order_no: seed.order_no,
      store_id: seed.store_id,
      store_name: seed.store_name,
      store_slug: String(seed.store_slug ?? "").trim(),
      total_amount: Math.round(Number(seed.total_amount) || itemsSum),
      discount_amount: Math.round(Number(seed.discount_amount) || 0),
      payment_amount: Math.round(Number(seed.payment_amount) || 0),
      delivery_fee_amount: null,
      payment_status: String(seed.payment_status ?? "paid"),
      order_status: seed.order_status,
      fulfillment_type: seed.fulfillment_type,
      buyer_note: seed.buyer_note ?? null,
      buyer_phone: null,
      buyer_payment_method: null,
      buyer_payment_method_detail: null,
      delivery_address_summary: null,
      delivery_address_detail: null,
      store_pickup_address_lines: undefined,
      created_at: seed.created_at,
    },
    items,
    hydratingDetail: true,
  };
}

function buildInitialPanelState(orderId: string, listSeed?: BuyerStoreOrderExpandListSeed | null): PanelState {
  const fromCache = panelStateFromCaches(orderId);
  if (fromCache) return fromCache;
  if (listSeed) return panelStateFromListSeed(listSeed);
  return { kind: "loading" };
}

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

function BuyerContactLine({ phone }: { phone: string }) {
  const { t } = useI18n();
  const d = parsePhMobileInput(phone);
  const href = d.length === 11 ? telHrefFromPhDb09(d) : null;
  const label = d.length === 11 ? formatPhMobileDisplay(d) : phone;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
        {t("mypage_comp_buyer_contact_heading")}
      </p>
      <p className="mt-1 text-sm text-[#123B4A]">
        {href ? (
          <a href={href} className="font-semibold text-signature underline">
            {label}
          </a>
        ) : (
          label
        )}
      </p>
    </div>
  );
}

function AddressHydratingPlaceholder() {
  const { t } = useI18n();
  return (
    <div className="animate-pulse space-y-2" aria-busy="true">
      <div className="h-3 w-24 rounded bg-[#EEF2F0]" />
      <div className="h-4 w-full rounded bg-[#EEF2F0]" />
      <div className="h-4 w-3/4 rounded bg-[#EEF2F0]" />
      <p className="sr-only">{t("mypage_comp_loading_short")}</p>
    </div>
  );
}

/** `/orders` 목록 카드 펼침 — 진행·주소·주문내역·결제 (리뷰·채팅은 카드 본문) */
export function MyStoreOrderExpandPanel({
  orderId,
  listSeed = null,
  onOrderMutated,
}: {
  orderId: string;
  listSeed?: BuyerStoreOrderExpandListSeed | null;
  onOrderMutated?: () => void;
}) {
  const { t, safeT, language } = useI18n();
  const dateLocale = language === "ko" ? "ko-KR" : "en-PH";

  const [state, setState] = useState<PanelState>(() => buildInitialPanelState(orderId, listSeed));
  const [cancelBusy, setCancelBusy] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundErr, setRefundErr] = useState<string | null>(null);

  const mergeEvents = useCallback((orderEvents: StoreOrderEventPublic[] | undefined) => {
    if (!orderEvents?.length) return;
    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      return { ...prev, orderEvents };
    });
  }, []);

  const loadEvents = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!orderId) return;
      try {
        const eventsRes = await fetchMeStoreOrderEventsDeduped(orderId);
        const orderEvents = parseEventsFromResponse(eventsRes);
        if (orderEvents) mergeEvents(orderEvents);
      } catch {
        if (!opts?.silent) {
          /* 이벤트는 보조 */
        }
      }
    },
    [mergeEvents, orderId]
  );

  const load = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const silent = opts?.silent === true;
      const force = opts?.force === true;
      if (!orderId) return;
      if (!silent) {
        setState((prev) => (prev.kind === "ok" ? prev : { kind: "loading" }));
      }
      try {
        const detailRes = await fetchMeStoreOrderDetailDeduped(orderId, { force });
        const parsed = parseDetailFromResponse(detailRes);
        if (!parsed) {
          if (!silent) {
            const data = detailRes.json as { error?: string };
            setState({
              kind: "error",
              message: typeof data?.error === "string" ? data.error : "load_failed",
            });
          }
          return;
        }
        setState((prev) => ({
          kind: "ok",
          order: parsed.order,
          items: parsed.items,
          orderEvents: prev.kind === "ok" ? prev.orderEvents : undefined,
          hydratingDetail: false,
        }));
        void loadEvents({ silent: true });
      } catch {
        if (!silent) setState({ kind: "error", message: "network_error" });
      }
    },
    [loadEvents, orderId]
  );

  const listSeedRef = useRef(listSeed);
  listSeedRef.current = listSeed;

  useEffect(() => {
    const initial = buildInitialPanelState(orderId, listSeedRef.current);
    setState(initial);
    void load({ silent: initial.kind === "ok" });
  }, [orderId, load]);

  useCustomerStoreOrderRowRealtime(orderId, {
    debounceMs: 350,
    onChange: () => void load({ silent: true, force: true }),
  });

  useSupabaseStoreOrderDeliveriesRealtime(
    orderId ? { kind: "order", orderId } : null,
    { debounceMs: 420, onChange: () => void load({ silent: true, force: true }) }
  );

  if (state.kind === "loading") {
    return (
      <div className="border-t border-[#DDE5E0] bg-[#F6FAFC] px-3 py-4 text-center text-sm text-[#6B7280]">
        {t("mypage_comp_loading_short")}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="border-t border-[#DDE5E0] bg-[#F6FAFC] px-3 py-4 text-center text-sm text-red-600">
        {t("mypage_comp_error_wrapped", { message: state.message })}
      </div>
    );
  }

  const { order, items, orderEvents, hydratingDetail } = state;
  const orderStatusLabel = (status: string) => buyerOrderStatusLabel(status, language);
  const prepClock = formatPrepClock(order.estimated_ready_at, dateLocale);
  const buyerProg = buyerStoreOrderProgressCopy(t, order, orderStatusLabel, prepClock);
  const isActive = ACTIVE_STATUSES.has(order.order_status);
  const payDisplay = formatBuyerPaymentDisplay(
    order.buyer_payment_method,
    order.buyer_payment_method_detail
  );
  const dash = t("mypage_comp_placeholder_dash");
  const itemsSumPhp = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
  const deliveryFeePhp = Math.max(0, Math.round(Number(order.delivery_fee_amount) || 0));
  const canBuyerCancel = storeOrderAwaitingFirstPayment(order);
  const canRefundRequest = canBuyerRequestStoreRefund(order.order_status, order.payment_status);
  const refundPending = order.order_status === "refund_requested";
  const eventLabels = storeOrderEventLabels(t);
  const hasDeliveryAddress =
    Boolean(order.delivery_address_summary?.trim()) || Boolean(order.delivery_address_detail?.trim());
  const hasPickupAddress = Boolean(order.store_pickup_address_lines?.length);
  const showAddressHydrating =
    hydratingDetail && !hasDeliveryAddress && !hasPickupAddress;

  async function cancelOrder() {
    setCancelBusy(true);
    try {
      const { json } = await patchMeStoreOrder(orderId, { cancel: true });
      const j = json as { ok?: boolean };
      if (j?.ok) {
        await load({ silent: true });
        onOrderMutated?.();
      }
    } finally {
      setCancelBusy(false);
    }
  }

  async function requestRefund() {
    setRefundErr(null);
    setRefundBusy(true);
    try {
      const { json } = await patchMeStoreOrder(orderId, {
        request_refund: true,
        refund_reason: refundReason.trim() || undefined,
      });
      const j = json as { ok?: boolean; error?: string };
      if (!j?.ok) {
        setRefundErr(typeof j.error === "string" ? j.error : "refund_request_failed");
        return;
      }
      await load({ silent: true });
      onOrderMutated?.();
    } catch {
      setRefundErr(t("mypage_comp_network_error"));
    } finally {
      setRefundBusy(false);
    }
  }

  return (
    <div className="border-t border-[#DDE5E0] bg-[#F6FAFC] px-3 py-3 sm:px-4">
      {isActive ? (
        <div className="mb-3 rounded-[4px] border border-[#DDE5E0] bg-white px-3 py-3">
          <p className="text-[12px] font-bold text-[color:var(--delivery-primary)]">
            {buyerProg.headline}
          </p>
          {buyerProg.lines.length ? (
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[12px] leading-snug text-[#6B7280]">
              {buyerProg.lines.map((line, i) => (
                <li key={`${i}:${line}`}>{line}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3">
            <StoreCommerceOrderTimeline
              variant="buyer_detail"
              fulfillmentType={order.fulfillment_type}
              orderStatus={order.order_status}
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-[4px] border border-[#DDE5E0] bg-white p-3">
        {showAddressHydrating ?
          <AddressHydratingPlaceholder />
        : order.fulfillment_type === "pickup" ?
          order.store_pickup_address_lines && order.store_pickup_address_lines.length > 0 ?
            <div className="text-sm text-[#123B4A]">
              <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
                {t("mypage_comp_address_pickup_heading")}
              </p>
              {order.store_pickup_address_lines.map((line, i) => (
                <p key={i} className={i === 0 ? "mt-1 font-medium" : "text-[#6B7280]"}>
                  {line}
                </p>
              ))}
            </div>
          : null
        : hasDeliveryAddress ?
          <div>
            <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
              {t("mypage_comp_address_delivery_heading")}
            </p>
            <div className="mt-1 text-sm text-[#123B4A]">
              <StoreOrderDeliveryAddressDisplay
                summary={order.delivery_address_summary}
                detail={order.delivery_address_detail}
                showDetailLabel={false}
              />
            </div>
          </div>
        : null}

        {order.buyer_phone?.trim() ?
          <BuyerContactLine phone={order.buyer_phone.trim()} />
        : null}

        {items.length > 0 ? (
          <div>
            <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
              {t("mypage_comp_order_lines_heading")}
            </p>
            <ul className="mt-2 space-y-2">
              {items.map((it) => {
                const optLines = orderLineOptionsDetailLines(it.options_snapshot_json);
                const optSum = orderLineOptionsSummary(it.options_snapshot_json);
                return (
                  <li
                    key={it.id}
                    className="rounded-[4px] border border-[#EEF2F0] bg-[#FAFCFB] px-2.5 py-2 text-sm"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 font-medium text-[#123B4A]">
                        {it.product_title_snapshot}
                      </span>
                      <span className="shrink-0 text-[#6B7280]">× {it.qty}</span>
                    </div>
                    {optLines.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-[12px] text-[#6B7280]">
                        {optLines.map((row, i) => (
                          <li key={i}>{row.title}</li>
                        ))}
                      </ul>
                    ) : optSum ? (
                      <p className="mt-1 text-[12px] text-[#6B7280]">{optSum}</p>
                    ) : null}
                    <div className="mt-1 flex justify-between text-[12px]">
                      <span className="text-[#6B7280]">
                        {lineDiscountDisplayI18n(
                          t,
                          Number(it.price_snapshot) || 0,
                          Number(it.qty) || 0,
                          Number(it.subtotal) || 0
                        )}
                      </span>
                      <span className="font-semibold tabular-nums text-[#123B4A]">
                        {formatMoneyPhp(Number(it.subtotal) || 0)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="border-t border-[#EEF2F0] pt-3 text-sm">
          <div className="flex justify-between gap-2 text-[#6B7280]">
            <span>{t("mypage_comp_items_subtotal")}</span>
            <span>{formatMoneyPhp(itemsSumPhp)}</span>
          </div>
          {Math.round(Number(order.discount_amount) || 0) > 0 ? (
            <div className="mt-1 flex justify-between gap-2 text-red-600" data-order-coupon-discount="1">
              <span>
                {t("store_owner_order_coupon_discount")}
                {[
                  (order as { coupon_offer_title?: string | null }).coupon_offer_title,
                  (order as { coupon_number?: string | null }).coupon_number,
                ]
                  .filter(Boolean)
                  .length > 0 ? (
                  <span className="mt-0.5 block text-xs font-normal text-sam-muted">
                    {[
                      (order as { coupon_offer_title?: string | null }).coupon_offer_title,
                      (order as { coupon_number?: string | null }).coupon_number,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </span>
              <span>−{formatMoneyPhp(Math.round(Number(order.discount_amount) || 0))}</span>
            </div>
          ) : null}
          {Math.round(Number((order as { gift_redemption_amount?: number }).gift_redemption_amount) || 0) >
          0 ? (
            <div className="mt-1 flex justify-between gap-2 text-red-600" data-order-gift-redemption="1">
              <span>
                {safeT("gift_u4_order_gift_line", {
                  fallbackKo: "상품권 사용",
                  fallbackEn: "Gift certificate",
                })}
              </span>
              <span>
                −
                {formatMoneyPhp(
                  Math.round(
                    Number((order as { gift_redemption_amount?: number }).gift_redemption_amount) || 0
                  )
                )}
              </span>
            </div>
          ) : null}
          {(() => {
            const giftUsed = Math.round(
              Number((order as { gift_redemption_amount?: number }).gift_redemption_amount) || 0
            );
            const st = String(order.order_status ?? "").toLowerCase();
            const refunded =
              st === "refunded" || st === "cancelled" || String(order.payment_status ?? "") === "refunded";
            if (!giftUsed || !refunded) return null;
            return (
              <div className="mt-1 flex justify-between gap-2 text-emerald-700" data-order-gift-restored="1">
                <span>
                  {safeT("gift_u4_order_gift_restored", {
                    fallbackKo: "상품권 복구",
                    fallbackEn: "Gift restored",
                  })}
                </span>
                <span>+{formatMoneyPhp(giftUsed)}</span>
              </div>
            );
          })()}
          <div className="mt-1 flex justify-between gap-2 text-[#6B7280]">
            <span>{t("mypage_comp_delivery_fee")}</span>
            <span>
              {deliveryFeePhp > 0 ? formatMoneyPhp(deliveryFeePhp) : t("mypage_comp_currency_zero")}
            </span>
          </div>
          <div className="mt-2 flex justify-between gap-2 border-t border-[#EEF2F0] pt-2 font-bold text-[#123B4A]">
            <span>{t("mypage_comp_grand_total")}</span>
            <span>{formatMoneyPhp(order.payment_amount)}</span>
          </div>
          {payDisplay !== dash ? (
            <p className="mt-2 text-[12px] text-[#6B7280]">
              {t("mypage_comp_payment_method_label", { method: payDisplay })}
            </p>
          ) : null}
          <p className="mt-1 text-[12px] text-[#6B7280]">
            {t("mypage_comp_order_date_line", {
              datetime: new Date(order.created_at).toLocaleString(dateLocale),
            })}
          </p>
        </div>
      </div>

      {orderEvents && orderEvents.length > 0 ? (
        <div className="mt-3 rounded-[4px] border border-[#DDE5E0] bg-white p-3">
          <p className="text-[11px] font-semibold uppercase text-[#6B7280]">
            {t("mypage_comp_order_history_heading")}
          </p>
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
            {orderEvents.slice(0, 8).map((ev) => (
              <li key={ev.id} className="text-[12px] text-[#6B7280]">
                <span className="font-medium text-[#123B4A]">
                  {eventLabels[ev.event_type] ?? ev.event_type}
                </span>
                {" · "}
                {new Date(ev.created_at).toLocaleString(dateLocale)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {order.store_slug ?
        <div className="mt-3">
          <Link
            href={`/stores/${encodeURIComponent(order.store_slug)}`}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[4px] border border-[#DDE5E0] bg-white px-3 text-sm font-semibold text-[#123B4A]"
          >
            {t("mypage_comp_view_store")}
          </Link>
        </div>
      : null}

      {canBuyerCancel ?
        <button
          type="button"
          disabled={cancelBusy}
          onClick={() => void cancelOrder()}
          className="mt-2 w-full rounded-[4px] border border-red-200 bg-white py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50"
        >
          {cancelBusy ? t("mypage_comp_processing") : t("mypage_comp_cancel_order")}
        </button>
      : null}

      {refundPending ?
        <p className="mt-2 rounded-[4px] bg-blue-50 px-3 py-2 text-sm text-blue-950">
          {t("mypage_comp_refund_pending_notice")}
        </p>
      : null}

      {canRefundRequest ?
        <div className="mt-2 rounded-[4px] border border-[#DDE5E0] bg-white p-3">
          <textarea
            className="w-full rounded-[4px] border border-[#DDE5E0] px-2 py-1.5 text-sm"
            rows={2}
            maxLength={500}
            value={refundReason}
            onChange={(ev) => setRefundReason(ev.target.value)}
            placeholder={t("mypage_comp_refund_reason_placeholder")}
          />
          {refundErr ? <p className="mt-1 text-sm text-red-600">{refundErr}</p> : null}
          <button
            type="button"
            disabled={refundBusy}
            onClick={() => void requestRefund()}
            className="mt-2 w-full rounded-[4px] border border-[#DDE5E0] py-2 text-sm font-medium disabled:opacity-50"
          >
            {refundBusy ? t("mypage_comp_processing") : t("mypage_comp_refund_submit")}
          </button>
        </div>
      : null}
    </div>
  );
}
