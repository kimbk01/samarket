"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { useOwnerStoreOrdersRealtime } from "@/hooks/stores/useOwnerStoreOrdersRealtime";
import {
  useSupabaseStoreOrderDeliveriesRealtime,
  type StoreOrderDeliveryRealtimeEvent,
} from "@/hooks/useSupabaseStoreOrderDeliveriesRealtime";
import {
  deliveryStatusOf,
  mapRealtimeRecordToOrderDelivery,
  mergeRealtimeRecordIntoOrderDelivery,
} from "@/lib/business/owner-store-order-delivery-row-rt";
import {
  listRowToOwnerOrder,
  ownerOrdersToListRows,
  sortOwnerStoreOrderListRowsDesc,
  type OwnerStoreOrderListRow,
} from "@/lib/business/owner-store-order-list-row-bridge";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import type { MessageKey } from "@/lib/i18n/messages";
import { buildStoreOrdersHref, type StoreOrderTabId } from "@/lib/business/store-orders-tab";
import {
  countOrdersMatchingTab,
  orderMatchesOwnerMainTab,
  parseOwnerOrderMainTab,
  type OwnerOrderMainTab,
} from "@/lib/business/owner-order-main-tab";
import { OwnerOrderStatusTimeline } from "@/components/business/owner/OwnerOrderStatusTimeline";
import { Biz } from "@/lib/ui/biz-component-classes";
import {
  OwnerStoreOrderDeliveryActionsAside,
  ownerOrderCardNoticeFooter,
  ownerOrderHasTransitionButtons,
} from "@/components/business/owner/OwnerStoreOrderDeliveryActions";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, parsePhMobileInput, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import { KASAMA_OWNER_HUB_BADGE_REFRESH } from "@/lib/chats/chat-channel-events";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import {
  r2d1OwnerOrdersTrace,
  r2d1OwnerOrdersTraceInstallCollector,
} from "@/lib/dibay/r2-d1-owner-orders-trace";
import {
  r2d1KpiMetaTrace,
  r2d1KpiMetaTraceInstallCollector,
} from "@/lib/dibay/r2-d1-kpi-meta-trace";
import { deriveOwnerStoreOrderMetaCounts } from "@/lib/stores/derive-owner-store-order-meta-counts";
import { fetchStoreOrdersListDeduped } from "@/lib/stores/fetch-store-orders-list-deduped";
import { OwnerStoreOrderChatSlidePanel } from "@/components/business/owner/OwnerStoreOrderChatSlidePanel";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import { BUYER_PUBLIC_LABEL_FALLBACK } from "@/lib/stores/buyer-public-label";
import { formatStoreOrderCheckoutEtaSummary } from "@/lib/stores/format-store-order-checkout-display";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";

/** 주문 카드 본문 — 매장 관리 폼과 동일 계열(14px 라벨/본문) */
const OC_LBL = "sam-text-body font-medium leading-snug text-sam-muted";
const OC_TX =
  "sam-text-body font-normal leading-normal text-sam-fg [overflow-wrap:anywhere] [word-break:break-word]";
const OC_TX_MUTED =
  "sam-text-body font-normal leading-normal text-sam-muted [overflow-wrap:anywhere] [word-break:break-word]";
const OC_TX_SM = "sam-text-body-secondary font-normal leading-snug text-sam-muted [overflow-wrap:anywhere]";
type ItemRow = {
  id: string;
  product_id: string;
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  subtotal: number;
  options_snapshot_json?: unknown;
};

type OrderRow = OwnerStoreOrderListRow;

function formatBuyerPhoneDisplay(raw: string | null | undefined): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s.length ? s : null;
}

function formatPrepClock(iso: string | null | undefined, lang: "ko" | "en"): string | null {
  const s = typeof iso === "string" ? iso.trim() : "";
  if (!s) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleTimeString(lang === "ko" ? "ko-KR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function ownerOrderPrepDelayed(order: OrderRow): boolean {
  const raw = order.estimated_ready_at;
  if (!raw || typeof raw !== "string") return false;
  const ts = new Date(raw.trim()).getTime();
  if (!Number.isFinite(ts)) return false;
  const term = new Set(["completed", "cancelled", "refunded"]);
  if (term.has(order.order_status)) return false;
  return ts < Date.now();
}

function deliveryStatusLabel(
  s: string | null | undefined,
  t: (key: MessageKey) => string
): string | null {
  const v = typeof s === "string" ? s.trim() : "";
  if (!v) return null;
  switch (v) {
    case "waiting_rider":
      return t("mypage_comp_delivery_status_waiting_rider");
    case "rider_assigned":
      return t("mypage_comp_delivery_status_rider_assigned");
    case "pickup_in_progress":
      return t("mypage_comp_delivery_status_pickup_in_progress");
    case "delivering":
      return t("mypage_comp_delivery_status_delivering");
    case "delivered":
      return t("mypage_comp_delivery_status_delivered");
    case "delivery_failed":
      return t("mypage_comp_delivery_status_delivery_failed");
    default:
      return v;
  }
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function completedAtMs(o: OrderRow): number {
  const u = typeof o.updated_at === "string" ? o.updated_at.trim() : "";
  if (u) {
    const t = new Date(u).getTime();
    if (Number.isFinite(t)) return t;
  }
  return new Date(o.created_at).getTime();
}

function ownerSlaBadgeLabel(o: OrderRow, t: (key: MessageKey, params?: Record<string, string>) => string): string | null {
  const r = typeof o.sla_warning_reason === "string" ? o.sla_warning_reason.trim() : "";
  if (r === "pending_over_5m") return t("store_biz_sla_pending_over_5m");
  if (r === "eta_overdue") return t("store_biz_sla_eta_overdue");
  if (r === "delivery_over_60m") return t("store_biz_sla_delivery_over_60m");
  if (r === "unassigned_over_10m") return t("store_biz_sla_unassigned_over_10m");
  if (r === "refund_overdue") return t("store_biz_sla_refund_overdue");
  if (o.needs_admin_attention === true) return t("store_biz_sla_admin_attention");
  const lvl = typeof o.sla_warning_level === "string" ? o.sla_warning_level.trim() : "";
  if (lvl) return t("store_biz_sla_level", { level: lvl });
  return null;
}

function OwnerOrderBuyerFields({ order }: { order: OrderRow }) {
  const { t } = useI18n();
  const phoneRaw = formatBuyerPhoneDisplay(order.buyer_phone);
  const phoneDigits = phoneRaw ? parsePhMobileInput(phoneRaw) : "";
  const phoneLabel =
    phoneRaw && phoneDigits.length === 11 ? formatPhMobileDisplay(phoneDigits) : phoneRaw ?? "";
  const phoneTelHref = phoneRaw
    ? telHrefFromLoosePhPhone(phoneRaw) ?? `tel:${phoneRaw.replace(/\s+/g, "")}`
    : null;
  const buyerLabel =
    typeof order.buyer_public_label === "string" && order.buyer_public_label.trim()
      ? order.buyer_public_label.trim()
      : BUYER_PUBLIC_LABEL_FALLBACK;
  return (
    <dl className="min-w-0 space-y-3 py-0.5">
      <div className="grid grid-cols-[minmax(3.75rem,auto)_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
        <dt className={`shrink-0 pt-0.5 ${OC_LBL}`}>{t("business_phase7_036")}</dt>
        <dd className={`min-w-0 max-w-full ${OC_TX}`}>{buyerLabel}</dd>
      </div>
      <div className="grid grid-cols-[minmax(3.75rem,auto)_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
        <dt className={`shrink-0 pt-0.5 ${OC_LBL}`}>{t("business_phase7_245")}</dt>
        <dd className={`min-w-0 max-w-full ${OC_TX}`}>
          {phoneRaw && phoneTelHref ? (
            <a
              href={phoneTelHref}
              className="font-medium text-signature underline decoration-signature/30 underline-offset-2 hover:decoration-signature"
            >
              {phoneLabel}
            </a>
          ) : (
            <span className={OC_TX_MUTED}>{t("business_phase7_264")}</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

const CHAT_LINK_CLASS =
  "inline-flex w-full min-w-0 cursor-pointer items-center justify-center rounded-ui-rect border border-signature/35 bg-sam-surface px-3 py-3 text-center sam-text-body font-semibold leading-snug text-sam-fg shadow-sm transition hover:bg-signature/5 [overflow-wrap:anywhere] [word-break:break-word]";

function OwnerOrderCard({
  storeId,
  order,
  onUpdated,
  isHighlight,
  onOpenChat,
}: {
  storeId: string;
  order: OrderRow;
  onUpdated: () => void;
  isHighlight: boolean;
  onOpenChat: (orderId: string) => void;
}) {
  const { t, language } = useI18n();
  const dateLocale = language === "ko" ? "ko-KR" : "en-US";
  const noticeFooter: ReactNode = ownerOrderCardNoticeFooter({
    id: order.id,
    order_status: order.order_status,
    fulfillment_type: order.fulfillment_type,
  });

  const isNewPending = order.order_status === "pending";
  const newPulse =
    isNewPending && order.fulfillment_type !== "local_delivery"
      ? `${Biz.newOrderAccent} owner-new-order-pulse rounded-[16px] border-[var(--biz-card-border)] bg-[var(--biz-card-bg)]`
      : isNewPending && order.fulfillment_type === "local_delivery"
        ? `${Biz.newOrderAccent} owner-new-order-pulse rounded-[16px] border-rose-200 bg-rose-50/30`
        : "";

  return (
    <li
      id={`owner-order-${order.id}`}
      className={`scroll-mt-[4.75rem] w-full min-w-0 overflow-hidden rounded-[16px] border p-3 shadow-[var(--biz-card-shadow)] sm:p-4 ${
        order.order_status === "refund_requested"
          ? "border-amber-300 bg-amber-50/40"
          : isNewPending
            ? newPulse
            : "border-sam-border-soft bg-sam-surface"
      } ${isHighlight ? "ring-2 ring-[var(--biz-primary)] ring-offset-2 ring-offset-[var(--biz-app-bg)]" : ""}`}
    >
      <div className="flex min-w-0 flex-nowrap items-start justify-between gap-2">
        <span className={`min-w-0 flex-1 break-all font-semibold ${OC_TX}`}>{order.order_no}</span>
        <span className={`max-w-[48%] shrink-0 text-right tabular-nums ${OC_TX_SM}`}>
          {new Date(order.created_at).toLocaleString(dateLocale)}
        </span>
      </div>

      <div
        data-owner-order-gray
        className="mt-3 w-full min-w-0 rounded-ui-rect border border-sam-border-soft bg-sam-app/90 px-3 py-3.5 sm:px-4 sm:py-4"
      >
        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 sm:gap-x-4">
          <div className="min-w-0 overflow-hidden">
            <OwnerOrderBuyerFields order={order} />
          </div>
          <div className="flex min-w-0 max-w-[min(100%,13.25rem)] flex-col justify-center justify-self-end sm:max-w-none">
            <button
              type="button"
              className={CHAT_LINK_CLASS}
              onClick={() => onOpenChat(order.id)}
            >
              {t("store_biz_chat_connect")}
            </button>
          </div>
        </div>
      </div>

      <p className={`mt-3 sam-text-page-title font-bold leading-tight text-sam-fg`}>
        {formatMoneyPhp(order.payment_amount)}
      </p>
      <p className={`mt-1.5 ${OC_TX_SM}`}>
        {order.fulfillment_type === "pickup"
          ? t("common_pickup_label")
          : t("common_delivery")}{" "}
        · {buyerOrderStatusLabel(order.order_status, language)}
      </p>
      <OwnerOrderStatusTimeline orderStatus={order.order_status} fulfillmentType={order.fulfillment_type} />
      <p className={`mt-1 ${OC_TX}`}>
        {t("store_biz_payment_line", {
          payment: formatBuyerPaymentDisplay(
            order.buyer_payment_method,
            order.buyer_payment_method_detail,
            language
          ),
        })}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {order.admin_locked === true ? (
          <span className="rounded bg-violet-200 px-2 py-0.5 sam-text-xxs font-semibold text-violet-950">
            {t("store_biz_platform_locked")}
          </span>
        ) : null}
        {ownerSlaBadgeLabel(order, t) ? (
          <span className="rounded bg-rose-200 px-2 py-0.5 sam-text-xxs font-semibold text-rose-950">
            {ownerSlaBadgeLabel(order, t)}
          </span>
        ) : null}
        {ownerOrderPrepDelayed(order) ? (
          <span className="rounded bg-rose-200 px-2 py-0.5 sam-text-xxs font-semibold text-rose-950">
            {t("store_biz_prep_delayed")}
          </span>
        ) : null}
        {order.order_status === "refund_requested" ? (
          <span className="rounded bg-amber-200 px-2 py-0.5 sam-text-xxs font-semibold text-amber-950">
            {t("store_biz_refund_badge")}
          </span>
        ) : null}
        {deliveryStatusLabel(order.delivery?.delivery_status, t) ? (
          <span className="rounded bg-slate-200 px-2 py-0.5 sam-text-xxs font-semibold text-slate-900">
            {deliveryStatusLabel(order.delivery?.delivery_status, t)}
          </span>
        ) : null}
      </div>
      <dl className="mt-2 grid gap-1 rounded-ui-rect border border-sam-border-soft bg-sam-app/80 px-3 py-2 sam-text-xxs text-sam-muted">
        <div className="flex justify-between gap-2">
          <dt>{t("business_phase7_265")}</dt>
          <dd className="text-right font-medium text-sam-fg tabular-nums">
            {new Date(order.created_at).toLocaleString(dateLocale)}
          </dd>
        </div>
        {order.accepted_at ? (
          <div className="flex justify-between gap-2">
            <dt>{t("business_phase7_247")}</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.accepted_at).toLocaleString(dateLocale)}
            </dd>
          </div>
        ) : null}
        {order.estimated_prep_minutes != null && Number(order.estimated_prep_minutes) > 0 ? (
          <div className="flex justify-between gap-2">
            <dt>{t("business_phase7_212")}</dt>
            <dd className="text-right font-medium text-sam-fg">{t("business_phase7_186", { v1: Math.floor(Number(order.estimated_prep_minutes)) })}</dd>
          </div>
        ) : null}
        {formatPrepClock(order.estimated_ready_at, language) ? (
          <div className="flex justify-between gap-2">
            <dt>{t("business_phase7_213")}</dt>
            <dd className="text-right font-medium text-sam-fg">
              {formatPrepClock(order.estimated_ready_at, language)}
            </dd>
          </div>
        ) : null}
        {order.delivery?.assigned_at ? (
          <div className="flex justify-between gap-2">
            <dt>{t("business_phase7_124")}</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.delivery.assigned_at).toLocaleString(dateLocale)}
            </dd>
          </div>
        ) : null}
        {order.delivery?.picked_up_at ? (
          <div className="flex justify-between gap-2">
            <dt>{t("business_phase7_322")}</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.delivery.picked_up_at).toLocaleString(dateLocale)}
            </dd>
          </div>
        ) : null}
        {order.delivery?.rider_accepted_at ? (
          <div className="flex justify-between gap-2">
            <dt>{t("business_phase7_060")}</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.delivery.rider_accepted_at).toLocaleString(dateLocale)}
            </dd>
          </div>
        ) : null}
        {order.delivery?.customer_arrived_at ? (
          <div className="flex justify-between gap-2">
            <dt>{t("business_phase7_016")}</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.delivery.customer_arrived_at).toLocaleString(dateLocale)}
            </dd>
          </div>
        ) : null}
        {order.delivery?.delivered_at ? (
          <div className="flex justify-between gap-2">
            <dt>{t("business_phase7_121")}</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.delivery.delivered_at).toLocaleString(dateLocale)}
            </dd>
          </div>
        ) : null}
        {order.delivery?.rider_failure_reported_at &&
        order.delivery.delivery_status !== "delivery_failed" ? (
          <div className="flex justify-between gap-2">
            <dt>{t("business_phase7_061")}</dt>
            <dd className="text-right text-sm text-amber-900">
              {t("store_biz_accepted_prefix")}{" "}
              <span className="tabular-nums">
                {new Date(order.delivery.rider_failure_reported_at).toLocaleString(dateLocale)}
              </span>
              {order.delivery.rider_failure_report_reason?.trim()
                ? ` · ${order.delivery.rider_failure_report_reason.trim()}`
                : ""}
            </dd>
          </div>
        ) : null}
        {order.dispute_status?.trim() ? (
          <div className="flex justify-between gap-2">
            <dt>{t("business_phase7_225")}</dt>
            <dd className="text-right font-medium text-amber-900">{order.dispute_status.trim()}</dd>
          </div>
        ) : null}
        {order.admin_note?.trim() ? (
          <div className="sm:col-span-2 border-t border-sam-border-soft pt-1">
            <dt className="mb-0.5">{t("business_phase7_318")}</dt>
            <dd className="whitespace-pre-wrap text-sam-fg">{order.admin_note.trim()}</dd>
          </div>
        ) : null}
      </dl>
      {(order.order_status === "ready_for_pickup" ||
        order.order_status === "delivering" ||
        order.order_status === "arrived") &&
      order.auto_complete_at ? (
        <p className={`mt-2 ${OC_TX_SM}`}>
          {t("store_biz_auto_complete_at", {
            at: new Date(order.auto_complete_at).toLocaleString(dateLocale),
          })}
        </p>
      ) : null}
      {(order.fulfillment_type === "local_delivery" || order.fulfillment_type === "shipping") &&
      (order.delivery_address_summary?.trim() || order.delivery_address_detail?.trim()) ? (
        <div className="mt-2 w-full min-w-0 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2.5">
          <p className={OC_LBL}>{t("business_phase7_122")}</p>
          <p className={`mt-1 whitespace-pre-wrap break-words ${OC_TX}`}>
            {[order.delivery_address_summary?.trim(), order.delivery_address_detail?.trim()]
              .filter(Boolean)
              .join("\n")}
          </p>
          {(() => {
            const line = formatStoreOrderCheckoutEtaSummary({
              checkout_eta_minutes: order.checkout_eta_minutes,
              checkout_route_distance_meters: order.checkout_route_distance_meters,
            });
            return line ?
                <p className={`mt-2 ${OC_TX_SM}`} title={t("business_phase7_021")}>
                  {line}
                </p>
              : null;
          })()}
        </div>
      ) : null}
      {order.buyer_note?.trim() ? (
        <div className="mt-2 w-full min-w-0 rounded-ui-rect border border-signature/30 bg-signature/5 px-3 py-2.5">
          <p className="sam-text-body font-medium text-signature">{t("business_phase7_020")}</p>
          <p className={`mt-1 whitespace-pre-wrap ${OC_TX}`}>{order.buyer_note.trim()}</p>
        </div>
      ) : null}
      <ul className="mt-3 space-y-1.5 border-t border-sam-border-soft pt-3">
        {order.items.map((it) => {
          const opt = orderLineOptionsSummary(it.options_snapshot_json);
          return (
            <li key={it.id} className="flex justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${OC_TX}`}>
                  {it.product_title_snapshot} × {it.qty}
                </span>
                {opt ? <span className={`mt-0.5 block ${OC_TX_SM}`}>{opt}</span> : null}
              </span>
              <span className={`shrink-0 tabular-nums ${OC_TX}`}>{formatMoneyPhp(it.subtotal)}</span>
            </li>
          );
        })}
      </ul>

      {noticeFooter ? (
        <div className="mt-3 border-t border-sam-border-soft pt-3">{noticeFooter}</div>
      ) : null}

      {ownerOrderHasTransitionButtons({
        id: order.id,
        order_status: order.order_status,
        fulfillment_type: order.fulfillment_type,
      }) ? (
        <div className="mt-3 border-t border-sam-border-soft pt-3">
          <OwnerStoreOrderDeliveryActionsAside
            storeId={storeId}
            order={{
              id: order.id,
              order_status: order.order_status,
              fulfillment_type: order.fulfillment_type,
            }}
            onUpdated={onUpdated}
            variant="rowBelow"
          />
        </div>
      ) : null}
    </li>
  );
}

const OWNER_ORDER_TAB_IDS: OwnerOrderMainTab[] = ["new", "progress", "done", "cancelled"];

function ownerMainTabLabel(tab: OwnerOrderMainTab, t: (key: MessageKey) => string): string {
  if (tab === "new") return t("store_owner_tab_new");
  if (tab === "progress") return t("store_owner_tab_active");
  if (tab === "done") return t("store_owner_tab_done");
  return t("store_biz_tab_cancelled");
}

export function OwnerStoreOrdersView() {
  const { t, language } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = useMemo(() => parseOwnerOrderMainTab(searchParams.get("tab")), [searchParams]);
  const loginHref = "/login";
  const ownerNotifAckRef = useRef(false);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);

  const openOrderChat = useCallback((orderId: string) => {
    const id = orderId.trim();
    if (!id) return;

    const el = typeof document !== "undefined" ? document.getElementById(`owner-order-${id}`) : null;
    if (el) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      window.setTimeout(() => setChatOrderId(id), 420);
    } else {
      setChatOrderId(id);
    }
  }, []);

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unauth" }
    | { kind: "config" }
    | { kind: "no_store" }
    | { kind: "error"; message: string }
    | {
        kind: "ok";
        storeId: string;
        storeName: string;
        orders: OrderRow[];
      }
  >({ kind: "loading" });

  const chatOrder = useMemo(() => {
    if (state.kind !== "ok" || !chatOrderId) return null;
    return state.orders.find((o) => o.id === chatOrderId) ?? null;
  }, [chatOrderId, state]);

  const prevPendingDeliveryRef = useRef<number | null>(null);
  const alertStoreIdRef = useRef<string | null>(null);
  const storeListCtxRef = useRef({ storeSlug: "", storeName: "" });
  const lastLoadReasonRef = useRef<string>("mount");
  const kpiTracePrevRef = useRef({
    pendingSummary: -1,
    pendingMeta: -1,
    tabNew: -1,
    tabProgress: -1,
    chipAccept: false,
    chipDelivery: false,
  });

  useLayoutEffect(() => {
    alertStoreIdRef.current = state.kind === "ok" ? state.storeId : null;
  }, [state]);

  useEffect(() => {
    const fn = () => primeStoreOrderAlertAudio();
    document.addEventListener("pointerdown", fn, { once: true });
    return () => document.removeEventListener("pointerdown", fn);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean; reason?: string }) => {
    const silent = opts?.silent === true;
    const reason = opts?.reason?.trim() || (silent ? "silent_load" : "initial_load");
    lastLoadReasonRef.current = reason;
    const traceKind =
      reason === "realtime_deliveries"
        ? "delivery_reload"
        : reason === "page_show_restore"
          ? "pageshow_fetch"
          : reason === "poll_45s" || reason === "visibility_visible"
            ? "poll_fetch"
            : "full_reload";
    r2d1OwnerOrdersTrace({
      kind: traceKind,
      source: "OwnerStoreOrdersView.load",
      owner: "OwnerStoreOrdersView",
      fetchReason: reason,
      storeId: alertStoreIdRef.current ?? undefined,
      silent,
    });
    if (!silent) setState({ kind: "loading" });
    try {
      const { status: srStatus, json: rawSj } = await fetchMeStoresListDeduped();
      const sj = rawSj as { ok?: boolean; stores?: { id: string; store_name?: string }[] };
      if (srStatus === 401) {
        if (!silent) setState({ kind: "unauth" });
        return;
      }
      if (srStatus === 503) {
        if (!silent) setState({ kind: "config" });
        return;
      }
      if (!sj?.ok || !Array.isArray(sj.stores) || sj.stores.length === 0) {
        if (!silent) setState({ kind: "no_store" });
        return;
      }
      const store = sj.stores[0] as { id: string; store_name?: string; slug?: string };
      storeListCtxRef.current = {
        storeSlug: String(store.slug ?? "").trim(),
        storeName: String(store.store_name ?? t("store_biz_my_store_fallback")),
      };
      const { json: rawOj } = await fetchStoreOrdersListDeduped(store.id);
      const oj = rawOj as {
        ok?: boolean;
        error?: string;
        meta?: { refund_requested_count?: unknown; pending_accept_count?: unknown; pending_delivery_count?: unknown };
        orders?: unknown;
      };
      if (!oj?.ok) {
        if (!silent) {
          setState({
            kind: "error",
            message: typeof oj?.error === "string" ? oj.error : "load_failed",
          });
        }
        return;
      }
      setState({
        kind: "ok",
        storeId: store.id,
        storeName: String(store.store_name ?? t("store_biz_my_store_fallback")),
        orders: (oj.orders ?? []) as OrderRow[],
      });
    } catch {
      if (!silent) setState({ kind: "error", message: "network_error" });
    }
  }, []);

  useEffect(() => {
    r2d1OwnerOrdersTraceInstallCollector();
    r2d1KpiMetaTraceInstallCollector();
    void load({ reason: "mount" });
  }, [load]);

  const highlightOrderId = searchParams.get("order_id")?.trim() ?? "";

  const filteredOrders = useMemo(() => {
    if (state.kind !== "ok") return [];
    return state.orders.filter((o) => orderMatchesOwnerMainTab(o, tab));
  }, [state, tab]);

  const summaryCounts = useMemo(() => {
    if (state.kind !== "ok") {
      return { pending: 0, preparing: 0, delivering: 0, doneToday: 0 };
    }
    const t0 = startOfTodayMs();
    let pending = 0;
    let preparing = 0;
    let delivering = 0;
    let doneToday = 0;
    for (const o of state.orders) {
      if (o.order_status === "pending") pending += 1;
      if (o.order_status === "preparing") preparing += 1;
      if (o.order_status === "delivering" || o.order_status === "arrived") delivering += 1;
      if (o.order_status === "completed" && completedAtMs(o) >= t0) doneToday += 1;
    }
    return { pending, preparing, delivering, doneToday };
  }, [state]);

  const tabBadges = useMemo(() => {
    if (state.kind !== "ok") return { new: 0, progress: 0 };
    return {
      new: countOrdersMatchingTab(state.orders, "new"),
      progress: countOrdersMatchingTab(state.orders, "progress"),
    };
  }, [state]);

  const metaCounts = useMemo(() => {
    if (state.kind !== "ok") {
      return { pendingAcceptCount: 0, pendingDeliveryCount: 0, refundRequestedCount: 0 };
    }
    return deriveOwnerStoreOrderMetaCounts(state.orders);
  }, [state]);

  useEffect(() => {
    if (state.kind !== "ok") return;
    const delivery = metaCounts.pendingDeliveryCount;
    const prev = prevPendingDeliveryRef.current;
    if (prev !== null && delivery > prev) {
      playDeliveryOrderAlertDebounced(state.storeId);
    }
    prevPendingDeliveryRef.current = delivery;
  }, [state, metaCounts.pendingDeliveryCount]);

  useLayoutEffect(() => {
    if (state.kind !== "ok") return;
    const pendingSummary = summaryCounts.pending;
    const pendingMetaDerived = metaCounts.pendingAcceptCount;
    const prev = kpiTracePrevRef.current;
    const highlightOid = highlightOrderId || undefined;

    if (pendingSummary !== prev.pendingSummary) {
      r2d1KpiMetaTrace({
        kind: "summary_render",
        pendingSummary,
        pendingMetaDerived,
        source: "OwnerStoreOrdersView.summaryCounts",
        orderId: highlightOid,
      });
    }

    if (pendingMetaDerived !== prev.pendingMeta) {
      r2d1KpiMetaTrace({
        kind: "kpi_derive_update",
        pendingSummary,
        pendingMetaDerived,
        pendingDeliveryMeta: metaCounts.pendingDeliveryCount,
        refundMeta: metaCounts.refundRequestedCount,
        source: "OwnerStoreOrdersView.metaCounts",
        orderId: highlightOid,
      });
    }

    if (
      prev.pendingSummary >= 0 &&
      prev.pendingMeta >= 0 &&
      prev.pendingSummary !== prev.pendingMeta &&
      pendingSummary === pendingMetaDerived
    ) {
      r2d1KpiMetaTrace({
        kind: "stale_window_closed",
        pendingSummary,
        pendingMetaDerived,
        source: "OwnerStoreOrdersView.kpi_unified",
        orderId: highlightOid,
        detail: "summary_equals_derived_meta",
      });
    }

    if (tabBadges.new !== prev.tabNew || tabBadges.progress !== prev.tabProgress) {
      r2d1KpiMetaTrace({
        kind: "tab_badge_render",
        pendingSummary,
        pendingMetaDerived,
        source: "OwnerStoreOrdersView.tabBadges",
        detail: `new=${tabBadges.new},progress=${tabBadges.progress}`,
      });
    }

    const chipAccept = metaCounts.pendingAcceptCount > 0;
    const chipDelivery = metaCounts.pendingDeliveryCount > 0;
    if (chipAccept !== prev.chipAccept || chipDelivery !== prev.chipDelivery) {
      r2d1KpiMetaTrace({
        kind: "chip_render",
        pendingSummary,
        pendingMetaDerived,
        pendingDeliveryMeta: metaCounts.pendingDeliveryCount,
        source: "OwnerStoreOrdersView.chips",
        detail: `accept=${chipAccept},delivery=${chipDelivery}`,
      });
    }

    kpiTracePrevRef.current = {
      pendingSummary,
      pendingMeta: pendingMetaDerived,
      tabNew: tabBadges.new,
      tabProgress: tabBadges.progress,
      chipAccept,
      chipDelivery,
    };
  }, [state, summaryCounts, metaCounts, tabBadges, highlightOrderId]);

  useEffect(() => {
    if (state.kind !== "ok") return;
    if (searchParams.get("ack_owner_notifications") !== "1") return;
    if (ownerNotifAckRef.current) return;
    ownerNotifAckRef.current = true;
    void (async () => {
      try {
        await fetch("/api/me/notifications", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mark_all_owner_store_commerce_read: true }),
        });
      } finally {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
        }
        const oid = searchParams.get("order_id")?.trim();
        const base = pathname ?? "/stores/owner/orders";
        const qs = oid ? `?order_id=${encodeURIComponent(oid)}` : "";
        router.replace(`${base}${qs}`, { scroll: false });
      }
    })();
  }, [state.kind, searchParams, pathname, router]);

  useEffect(() => {
    if (state.kind !== "ok" || !highlightOrderId) return;
    const exists = state.orders.some((o) => o.id === highlightOrderId);
    if (!exists) return;
    const t = window.setTimeout(() => {
      document.getElementById(`owner-order-${highlightOrderId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 250);
    return () => clearTimeout(t);
  }, [state, highlightOrderId]);

  useRefetchOnPageShowRestore(() => void load({ silent: true, reason: "page_show_restore" }));

  const pollStoreId = state.kind === "ok" ? state.storeId : null;
  const pollStoreName = state.kind === "ok" ? state.storeName : "";

  const setOrdersForRealtime: Dispatch<
    SetStateAction<import("@/lib/store-owner/types").OwnerOrder[]>
  > =
    useCallback((action) => {
      setState((prev) => {
        if (prev.kind !== "ok") return prev;
        const ctx = {
          storeId: prev.storeId,
          storeSlug: storeListCtxRef.current.storeSlug,
          storeName: prev.storeName,
        };
        const prevOwner = prev.orders.map((r) => listRowToOwnerOrder(r, ctx));
        const nextOwner =
          typeof action === "function" ? action(prevOwner) : action;
        const orders = sortOwnerStoreOrderListRowsDesc(
          ownerOrdersToListRows(prev.orders, nextOwner)
        );
        return { ...prev, orders };
      });
    }, []);

  const enrichOrder = useCallback((orderId: string) => {
    const oid = orderId.trim();
    const storeId = alertStoreIdRef.current;
    if (!oid || !storeId) return;
    void runSingleFlight(`owner:store-order-enrich:${storeId}:${oid}`, async () => {
        const res = await fetch(
          `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(oid)}`,
          { credentials: "include", cache: "no-store" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          order?: OrderRow;
          delivery?: OrderRow["delivery"];
        };
        if (!json?.ok || !json.order) return;
        setState((cur) => {
          if (cur.kind !== "ok") return cur;
          const idx = cur.orders.findIndex((o) => o.id === oid);
          const merged: OrderRow = {
            ...json.order!,
            items: json.order!.items ?? [],
            delivery: json.delivery ?? cur.orders[idx]?.delivery ?? null,
            buyer_public_label:
              cur.orders[idx]?.buyer_public_label ?? json.order!.buyer_public_label,
          };
          if (idx < 0) {
            return {
              ...cur,
              orders: sortOwnerStoreOrderListRowsDesc([merged, ...cur.orders]),
            };
          }
          const next = [...cur.orders];
          next[idx] = { ...next[idx]!, ...merged };
          return { ...cur, orders: sortOwnerStoreOrderListRowsDesc(next) };
        });
        r2d1OwnerOrdersTrace({
          kind: "row_patch_update",
          source: "OwnerStoreOrdersView.enrichOrder",
          owner: "OwnerStoreOrdersView",
          storeId,
          orderId: oid,
          fetchReason: "order_enrich_get",
        });
      });
  }, []);

  useOwnerStoreOrdersRealtime({
    storeId: pollStoreId,
    storeSlug: storeListCtxRef.current.storeSlug,
    storeName: pollStoreName,
    enabled: state.kind === "ok" && !!pollStoreId,
    debounceUpdateMs: 140,
    setOrders: setOrdersForRealtime,
    requestOrderEnrich: enrichOrder,
    onRealtimeInsert: (_orderId, row) => {
      if (String(row.fulfillment_type ?? "") !== "local_delivery") return;
      playDeliveryOrderAlertDebounced(alertStoreIdRef.current);
    },
  });

  const patchDeliveryFromRealtime = useCallback((ev: StoreOrderDeliveryRealtimeEvent) => {
    const oid = ev.orderId.trim();
    if (!oid) return;
    setState((prev) => {
      if (prev.kind !== "ok") return prev;
      const idx = prev.orders.findIndex((o) => o.id === oid);
      if (idx < 0) {
        r2d1OwnerOrdersTrace({
          kind: "delivery_row_patch_miss",
          source: "OwnerStoreOrdersView.patchDeliveryFromRealtime",
          owner: "OwnerStoreOrdersView",
          storeId: prev.storeId,
          orderId: oid,
          deliveryId: oid,
          eventType: ev.eventType,
          fetchReason: "order_not_in_list",
        });
        return prev;
      }
      const row = prev.orders[idx]!;
      const beforeDeliveryStatus = deliveryStatusOf(row.delivery);
      let nextDelivery = row.delivery;
      if (ev.eventType === "DELETE") {
        nextDelivery = null;
      } else if (ev.eventType === "INSERT" && ev.newRow) {
        nextDelivery = mapRealtimeRecordToOrderDelivery(ev.newRow);
      } else if (ev.eventType === "UPDATE" && ev.newRow) {
        nextDelivery = mergeRealtimeRecordIntoOrderDelivery(row.delivery, ev.newRow);
      }
      const afterDeliveryStatus = deliveryStatusOf(nextDelivery);
      const deliveryUnchanged =
        (row.delivery == null && nextDelivery == null) ||
        (row.delivery != null &&
          nextDelivery != null &&
          row.delivery.order_id === nextDelivery.order_id &&
          row.delivery.delivery_status === nextDelivery.delivery_status &&
          row.delivery.rider_id === nextDelivery.rider_id &&
          row.delivery.assigned_at === nextDelivery.assigned_at &&
          row.delivery.picked_up_at === nextDelivery.picked_up_at &&
          row.delivery.delivered_at === nextDelivery.delivered_at &&
          row.delivery.updated_at === nextDelivery.updated_at);
      if (deliveryUnchanged) return prev;

      const patchKind =
        ev.eventType === "INSERT"
          ? "delivery_row_patch_insert"
          : ev.eventType === "UPDATE"
            ? "delivery_row_patch_update"
            : "delivery_row_patch_delete";

      r2d1OwnerOrdersTrace({
        kind: patchKind,
        source: "OwnerStoreOrdersView.patchDeliveryFromRealtime",
        owner: "OwnerStoreOrdersView",
        storeId: prev.storeId,
        orderId: oid,
        deliveryId: oid,
        eventType: ev.eventType,
        fetchReason: "delivery_realtime_row_patch",
        beforeDeliveryStatus,
        afterDeliveryStatus,
        beforeCount: prev.orders.length,
        afterCount: prev.orders.length,
      });
      r2d1OwnerOrdersTrace({
        kind: "delivery_full_reload_blocked",
        source: "OwnerStoreOrdersView.patchDeliveryFromRealtime",
        owner: "OwnerStoreOrdersView",
        storeId: prev.storeId,
        orderId: oid,
        deliveryId: oid,
        fetchReason: "skipped_load_realtime_deliveries",
      });

      const orders = [...prev.orders];
      orders[idx] = { ...row, delivery: nextDelivery };
      return { ...prev, orders };
    });
  }, []);

  useSupabaseStoreOrderDeliveriesRealtime(
    pollStoreId ? { kind: "store", storeId: pollStoreId } : null,
    { onDeliveryEvent: patchDeliveryFromRealtime }
  );

  useEffect(() => {
    if (!pollStoreId) return;
    let inFlight = false;
    const safeSilentLoad = (reason: "poll_45s" | "visibility_visible") => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (inFlight) return;
      inFlight = true;
      void load({ silent: true, reason }).finally(() => {
        inFlight = false;
      });
    };
    let intervalId: number | null = null;
    const stopPoll = () => {
      if (intervalId == null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const startPoll = () => {
      stopPoll();
      intervalId = window.setInterval(() => safeSilentLoad("poll_45s"), 45_000);
    };
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        safeSilentLoad("visibility_visible");
        startPoll();
      } else {
        stopPoll();
      }
    };
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startPoll();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopPoll();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollStoreId, load]);

  let body: ReactNode;
  if (state.kind === "loading") {
    body = <p className="text-sm text-sam-muted">{t("common_loading")}</p>;
  } else if (state.kind === "unauth") {
    body = (
      <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">
        <p>{t("business_phase7_064")}</p>
        <Link href={loginHref} className="mt-3 inline-flex rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white">
          {t("store_biz_login_view_orders")}
        </Link>
      </div>
    );
  } else if (state.kind === "config") {
    body = <p className="text-sm text-sam-muted">{t("business_phase7_158")}</p>;
  } else if (state.kind === "no_store") {
    body = (
      <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">
        <p>{t("business_phase7_057")}</p>
        <Link href="/stores/owner/apply" className="mt-2 inline-block text-signature">
          {t("store_biz_apply_store")}
        </Link>
      </div>
    );
  } else if (state.kind === "error") {
    body = (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <p className="text-sm text-red-600">{resolveOwnerApiErrorMessage(state.message, t)}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-signature underline"
        >
          {t("store_biz_retry")}
        </button>
      </div>
    );
  } else {
    body = (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <div className="sticky top-0 z-10 -mx-1 mb-3 border-b border-[var(--biz-card-border)] bg-[var(--biz-app-bg)]/95 px-1 py-2 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 shadow-[var(--biz-card-shadow)]">
              <p className="text-[11px] font-medium text-[var(--biz-text-muted)]">{t("business_phase7_175")}</p>
              <p className="text-[18px] font-bold tabular-nums text-[var(--biz-text)]">{summaryCounts.pending}</p>
            </div>
            <div className="rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 shadow-[var(--biz-card-shadow)]">
              <p className="text-[11px] font-medium text-[var(--biz-text-muted)]">{t("business_phase7_256")}</p>
              <p className="text-[18px] font-bold tabular-nums text-[var(--biz-text)]">{summaryCounts.preparing}</p>
            </div>
            <div className="rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 shadow-[var(--biz-card-shadow)]">
              <p className="text-[11px] font-medium text-[var(--biz-text-muted)]">{t("business_phase7_119")}</p>
              <p className="text-[18px] font-bold tabular-nums text-[var(--biz-text)]">{summaryCounts.delivering}</p>
            </div>
            <div className="rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 shadow-[var(--biz-card-shadow)]">
              <p className="text-[11px] font-medium text-[var(--biz-text-muted)]">{t("business_phase7_215")}</p>
              <p className="text-[18px] font-bold tabular-nums text-[var(--biz-primary)]">{summaryCounts.doneToday}</p>
            </div>
          </div>
          <div className="mt-2 flex min-h-[48px] w-full flex-nowrap rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-1 shadow-sm">
            {OWNER_ORDER_TAB_IDS.map((tabId) => {
              const active = tab === tabId;
              const badge =
                tabId === "new" && tabBadges.new > 0
                  ? tabBadges.new
                  : tabId === "progress" && tabBadges.progress > 0
                    ? tabBadges.progress
                    : null;
              return (
                <Link
                  key={tabId}
                  href={buildStoreOrdersHref({ storeId: state.storeId, tab: tabId as StoreOrderTabId })}
                  scroll={false}
                  className={[
                    Biz.tabBase,
                    "relative flex min-h-[48px] flex-1 flex-col items-center justify-center rounded-[12px] px-1",
                    active ? Biz.tabActive : "",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-1">
                    {ownerMainTabLabel(tabId, t)}
                    {badge != null ? (
                      <span className="rounded-full bg-[var(--biz-primary-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--biz-primary)]">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-sam-muted">{state.storeName}</p>
          <div className="flex flex-wrap items-center gap-2">
            {metaCounts.pendingDeliveryCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 sam-text-xxs font-semibold text-rose-950">
                {t("store_biz_badge_delivery_waiting", { count: String(metaCounts.pendingDeliveryCount) })}
              </span>
            ) : null}
            {metaCounts.pendingAcceptCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 sam-text-xxs font-semibold text-violet-950">
                {t("store_biz_badge_accept_waiting", { count: String(metaCounts.pendingAcceptCount) })}
              </span>
            ) : null}
            {metaCounts.refundRequestedCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 sam-text-xxs font-semibold text-amber-950">
                {t("store_biz_badge_refund_count", { count: String(metaCounts.refundRequestedCount) })}
              </span>
            ) : null}
          </div>
        </div>
        {metaCounts.pendingDeliveryCount > 0 ? (
          <div
            className="rounded-ui-rect border border-rose-200 bg-rose-50/95 px-3 py-2.5 sam-text-helper leading-relaxed text-rose-950"
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold">{t("business_phase7_114")}</p>
          </div>
        ) : null}
        {metaCounts.pendingAcceptCount > 0 && metaCounts.pendingDeliveryCount === 0 ? (
          <div className="rounded-ui-rect border border-violet-200 bg-violet-50/90 px-3 py-2 sam-text-helper text-violet-950">
            {t("store_biz_pending_accept_banner", { count: String(metaCounts.pendingAcceptCount) })}
          </div>
        ) : null}
      {metaCounts.refundRequestedCount > 0 ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-3 py-2 sam-text-helper text-amber-950">
          {t("store_biz_refund_admin_banner")}
        </div>
      ) : null}
      {state.orders.length === 0 ? (
        <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">
          <p className="text-sam-fg">{t("business_phase7_184")}</p>
          <p className="mt-1">{t("business_phase7_084")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/stores/owner?storeId=${encodeURIComponent(state.storeId)}`}
              className="inline-flex rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white"
            >
              {t("store_biz_view_operations")}
            </Link>
            <Link
              href={`/stores/owner/profile?storeId=${encodeURIComponent(state.storeId)}`}
              className="inline-flex rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 font-medium text-sam-fg"
            >
              {t("store_biz_check_store_info")}
            </Link>
          </div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-[16px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-6 text-[14px] text-[var(--biz-text-muted)] shadow-[var(--biz-card-shadow)]">
          <p className="font-semibold text-[var(--biz-text)]">{t("business_phase7_233")}</p>
          <p className="mt-1">{t("business_phase7_050")}</p>
        </div>
      ) : (
        <ul className={`${OWNER_STORE_STACK_Y_CLASS} w-full min-w-0`}>
          {filteredOrders.map((o) => (
            <OwnerOrderCard
              key={o.id}
              storeId={state.storeId}
              order={o}
              onUpdated={() => void load()}
              isHighlight={highlightOrderId === o.id}
              onOpenChat={openOrderChat}
            />
          ))}
        </ul>
      )}
      </div>
    );
  }

  return (
    <div className="max-w-full min-w-0 overflow-x-hidden">
      <div className="mx-auto min-w-0 max-w-4xl py-1">{body}</div>
      {state.kind === "ok" && chatOrderId ? (
        <OwnerStoreOrderChatSlidePanel
          orderId={chatOrderId}
          order={chatOrder}
          storeId={state.storeId}
          storeName={state.storeName}
          onClose={() => setChatOrderId(null)}
        />
      ) : null}
    </div>
  );
}
