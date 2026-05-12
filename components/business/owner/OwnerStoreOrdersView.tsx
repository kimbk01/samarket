"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { useSupabaseStoreOrdersRealtime } from "@/hooks/useSupabaseStoreOrdersRealtime";
import { useSupabaseStoreOrderDeliveriesRealtime } from "@/hooks/useSupabaseStoreOrderDeliveriesRealtime";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
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
import { fetchStoreOrdersListDeduped } from "@/lib/stores/fetch-store-orders-list-deduped";
import { OwnerStoreOrderChatModal } from "@/components/business/owner/OwnerStoreOrderChatModal";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import { BUYER_PUBLIC_LABEL_FALLBACK } from "@/lib/stores/buyer-public-label";
import { formatStoreOrderCheckoutEtaSummary } from "@/lib/stores/format-store-order-checkout-display";

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

type OrderRow = {
  id: string;
  order_no: string;
  buyer_user_id: string;
  /** 프로필 기반 닉네임·사용자명 등 (API `buyer_public_label`) */
  buyer_public_label?: string | null;
  buyer_phone?: string | null;
  total_amount: number;
  payment_amount: number;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note: string | null;
  buyer_payment_method?: string | null;
  buyer_payment_method_detail?: string | null;
  delivery_address_summary?: string | null;
  delivery_address_detail?: string | null;
  created_at: string;
  updated_at?: string | null;
  auto_complete_at?: string | null;
  estimated_prep_minutes?: number | null;
  estimated_ready_at?: string | null;
  accepted_at?: string | null;
  admin_locked?: boolean | null;
  admin_flagged?: boolean | null;
  dispute_status?: string | null;
  admin_note?: string | null;
  sla_warning_level?: string | null;
  sla_warning_reason?: string | null;
  sla_warning_at?: string | null;
  needs_admin_attention?: boolean | null;
  checkout_eta_minutes?: number | null;
  checkout_route_distance_meters?: number | null;
  delivery?: {
    order_id: string;
    rider_id: string | null;
    delivery_status: string;
    assigned_at: string | null;
    picked_up_at: string | null;
    delivered_at: string | null;
    rider_accepted_at?: string | null;
    customer_arrived_at?: string | null;
    rider_failure_reported_at?: string | null;
    rider_failure_report_reason?: string | null;
    updated_at: string | null;
    admin_note?: string | null;
  } | null;
  items: ItemRow[];
};

function formatBuyerPhoneDisplay(raw: string | null | undefined): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s.length ? s : null;
}

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

function ownerOrderPrepDelayed(order: OrderRow): boolean {
  const raw = order.estimated_ready_at;
  if (!raw || typeof raw !== "string") return false;
  const ts = new Date(raw.trim()).getTime();
  if (!Number.isFinite(ts)) return false;
  const term = new Set(["completed", "cancelled", "refunded"]);
  if (term.has(order.order_status)) return false;
  return ts < Date.now();
}

function deliveryStatusLabel(s: string | null | undefined): string | null {
  const t = typeof s === "string" ? s.trim() : "";
  if (!t) return null;
  switch (t) {
    case "waiting_rider":
      return "배차 대기";
    case "rider_assigned":
      return "라이더 배정";
    case "pickup_in_progress":
      return "픽업중";
    case "delivering":
      return "배달중";
    case "delivered":
      return "배달완료";
    case "delivery_failed":
      return "배송실패";
    default:
      return t;
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

function ownerSlaBadgeLabel(o: OrderRow): string | null {
  const r = typeof o.sla_warning_reason === "string" ? o.sla_warning_reason.trim() : "";
  if (r === "pending_over_5m") return "주문 방치";
  if (r === "eta_overdue") return "ETA 초과";
  if (r === "delivery_over_60m") return "장기 배송";
  if (r === "unassigned_over_10m") return "미배차";
  if (r === "refund_overdue") return "환불 지연";
  if (o.needs_admin_attention === true) return "운영 확인중";
  const lvl = typeof o.sla_warning_level === "string" ? o.sla_warning_level.trim() : "";
  if (lvl) return `SLA ${lvl}`;
  return null;
}

function OwnerOrderBuyerFields({ order }: { order: OrderRow }) {
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
        <dt className={`shrink-0 pt-0.5 ${OC_LBL}`}>구매자</dt>
        <dd className={`min-w-0 max-w-full ${OC_TX}`}>{buyerLabel}</dd>
      </div>
      <div className="grid grid-cols-[minmax(3.75rem,auto)_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
        <dt className={`shrink-0 pt-0.5 ${OC_LBL}`}>전화번호</dt>
        <dd className={`min-w-0 max-w-full ${OC_TX}`}>
          {phoneRaw && phoneTelHref ? (
            <a
              href={phoneTelHref}
              className="font-medium text-signature underline decoration-signature/30 underline-offset-2 hover:decoration-signature"
            >
              {phoneLabel}
            </a>
          ) : (
            <span className={OC_TX_MUTED}>주문 시 미기재</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

const FULFILL_LABEL: Record<string, string> = {
  pickup: "포장 픽업",
  local_delivery: "배달",
  shipping: "배달",
};

const STATUS_LABEL: Record<string, string> = { ...BUYER_ORDER_STATUS_LABEL };

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
          {new Date(order.created_at).toLocaleString("ko-KR")}
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
              채팅 연결
            </button>
          </div>
        </div>
      </div>

      <p className={`mt-3 sam-text-page-title font-bold leading-tight text-sam-fg`}>
        {formatMoneyPhp(order.payment_amount)}
      </p>
      <p className={`mt-1.5 ${OC_TX_SM}`}>
        {FULFILL_LABEL[order.fulfillment_type] ?? order.fulfillment_type} ·{" "}
        {STATUS_LABEL[order.order_status] ?? order.order_status}
      </p>
      <OwnerOrderStatusTimeline orderStatus={order.order_status} fulfillmentType={order.fulfillment_type} />
      <p className={`mt-1 ${OC_TX}`}>
        결제 {formatBuyerPaymentDisplay(order.buyer_payment_method, order.buyer_payment_method_detail)}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {order.admin_locked === true ? (
          <span className="rounded bg-violet-200 px-2 py-0.5 sam-text-xxs font-semibold text-violet-950">
            플랫폼 잠금
          </span>
        ) : null}
        {ownerSlaBadgeLabel(order) ? (
          <span className="rounded bg-rose-200 px-2 py-0.5 sam-text-xxs font-semibold text-rose-950">
            {ownerSlaBadgeLabel(order)}
          </span>
        ) : null}
        {ownerOrderPrepDelayed(order) ? (
          <span className="rounded bg-rose-200 px-2 py-0.5 sam-text-xxs font-semibold text-rose-950">
            준비 지연
          </span>
        ) : null}
        {order.order_status === "refund_requested" ? (
          <span className="rounded bg-amber-200 px-2 py-0.5 sam-text-xxs font-semibold text-amber-950">
            환불 요청
          </span>
        ) : null}
        {deliveryStatusLabel(order.delivery?.delivery_status) ? (
          <span className="rounded bg-slate-200 px-2 py-0.5 sam-text-xxs font-semibold text-slate-900">
            {deliveryStatusLabel(order.delivery?.delivery_status)}
          </span>
        ) : null}
      </div>
      <dl className="mt-2 grid gap-1 rounded-ui-rect border border-sam-border-soft bg-sam-app/80 px-3 py-2 sam-text-xxs text-sam-muted">
        <div className="flex justify-between gap-2">
          <dt>주문 접수</dt>
          <dd className="text-right font-medium text-sam-fg tabular-nums">
            {new Date(order.created_at).toLocaleString("ko-KR")}
          </dd>
        </div>
        {order.accepted_at ? (
          <div className="flex justify-between gap-2">
            <dt>접수 확인</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.accepted_at).toLocaleString("ko-KR")}
            </dd>
          </div>
        ) : null}
        {order.estimated_prep_minutes != null && Number(order.estimated_prep_minutes) > 0 ? (
          <div className="flex justify-between gap-2">
            <dt>예상 준비</dt>
            <dd className="text-right font-medium text-sam-fg">약 {Math.floor(Number(order.estimated_prep_minutes))}분</dd>
          </div>
        ) : null}
        {formatPrepClockKo(order.estimated_ready_at) ? (
          <div className="flex justify-between gap-2">
            <dt>예상 준비 완료</dt>
            <dd className="text-right font-medium text-sam-fg">
              {formatPrepClockKo(order.estimated_ready_at)}
            </dd>
          </div>
        ) : null}
        {order.delivery?.assigned_at ? (
          <div className="flex justify-between gap-2">
            <dt>배차 시각</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.delivery.assigned_at).toLocaleString("ko-KR")}
            </dd>
          </div>
        ) : null}
        {order.delivery?.picked_up_at ? (
          <div className="flex justify-between gap-2">
            <dt>픽업 완료</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.delivery.picked_up_at).toLocaleString("ko-KR")}
            </dd>
          </div>
        ) : null}
        {order.delivery?.rider_accepted_at ? (
          <div className="flex justify-between gap-2">
            <dt>라이더 수락</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.delivery.rider_accepted_at).toLocaleString("ko-KR")}
            </dd>
          </div>
        ) : null}
        {order.delivery?.customer_arrived_at ? (
          <div className="flex justify-between gap-2">
            <dt>고객 도착</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.delivery.customer_arrived_at).toLocaleString("ko-KR")}
            </dd>
          </div>
        ) : null}
        {order.delivery?.delivered_at ? (
          <div className="flex justify-between gap-2">
            <dt>배송 완료</dt>
            <dd className="text-right font-medium text-sam-fg tabular-nums">
              {new Date(order.delivery.delivered_at).toLocaleString("ko-KR")}
            </dd>
          </div>
        ) : null}
        {order.delivery?.rider_failure_reported_at &&
        order.delivery.delivery_status !== "delivery_failed" ? (
          <div className="flex justify-between gap-2">
            <dt>라이더 실패 보고</dt>
            <dd className="text-right text-sm text-amber-900">
              접수{" "}
              <span className="tabular-nums">
                {new Date(order.delivery.rider_failure_reported_at).toLocaleString("ko-KR")}
              </span>
              {order.delivery.rider_failure_report_reason?.trim()
                ? ` · ${order.delivery.rider_failure_report_reason.trim()}`
                : ""}
            </dd>
          </div>
        ) : null}
        {order.dispute_status?.trim() ? (
          <div className="flex justify-between gap-2">
            <dt>운영 분쟁·긴급</dt>
            <dd className="text-right font-medium text-amber-900">{order.dispute_status.trim()}</dd>
          </div>
        ) : null}
        {order.admin_note?.trim() ? (
          <div className="sm:col-span-2 border-t border-sam-border-soft pt-1">
            <dt className="mb-0.5">플랫폼 메모</dt>
            <dd className="whitespace-pre-wrap text-sam-fg">{order.admin_note.trim()}</dd>
          </div>
        ) : null}
      </dl>
      {(order.order_status === "ready_for_pickup" ||
        order.order_status === "delivering" ||
        order.order_status === "arrived") &&
      order.auto_complete_at ? (
        <p className={`mt-2 ${OC_TX_SM}`}>
          자동 완료 예정:{" "}
          <span className="font-medium text-sam-fg">
            {new Date(order.auto_complete_at).toLocaleString("ko-KR")}
          </span>
        </p>
      ) : null}
      {(order.fulfillment_type === "local_delivery" || order.fulfillment_type === "shipping") &&
      (order.delivery_address_summary?.trim() || order.delivery_address_detail?.trim()) ? (
        <div className="mt-2 w-full min-w-0 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2.5">
          <p className={OC_LBL}>배송지</p>
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
                <p className={`mt-2 ${OC_TX_SM}`} title="고객 주소·매장 위치 변경 시 자동 갱신">
                  {line}
                </p>
              : null;
          })()}
        </div>
      ) : null}
      {order.buyer_note?.trim() ? (
        <div className="mt-2 w-full min-w-0 rounded-ui-rect border border-signature/30 bg-signature/5 px-3 py-2.5">
          <p className="sam-text-body font-medium text-signature">고객 요청 사항</p>
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

const OWNER_ORDER_TABS: Array<{ id: OwnerOrderMainTab; label: string }> = [
  { id: "new", label: "신규" },
  { id: "progress", label: "진행중" },
  { id: "done", label: "완료" },
  { id: "cancelled", label: "취소" },
];

export function OwnerStoreOrdersView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = useMemo(() => parseOwnerOrderMainTab(searchParams.get("tab")), [searchParams]);
  const loginHref = "/login";
  const ownerNotifAckRef = useRef(false);
  const [chatModal, setChatModal] = useState<{
    orderId: string;
    anchorTopPx: number;
  } | null>(null);

  const openOrderChat = useCallback((orderId: string) => {
    const id = orderId.trim();
    if (!id) return;

    const measureAnchor = (): number => {
      const card = document.getElementById(`owner-order-${id}`);
      const gray = card?.querySelector<HTMLElement>("[data-owner-order-gray]");
      const bottom = gray?.getBoundingClientRect().bottom;
      return typeof bottom === "number" && Number.isFinite(bottom) ? bottom : 120;
    };

    const el = typeof document !== "undefined" ? document.getElementById(`owner-order-${id}`) : null;
    if (el) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      window.setTimeout(() => {
        setChatModal({ orderId: id, anchorTopPx: measureAnchor() });
      }, 420);
    } else {
      setChatModal({ orderId: id, anchorTopPx: measureAnchor() });
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
        refundRequestedCount: number;
        pendingAcceptCount: number;
        pendingDeliveryCount: number;
      }
  >({ kind: "loading" });

  const prevPendingDeliveryRef = useRef<number | null>(null);
  const alertStoreIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    alertStoreIdRef.current = state.kind === "ok" ? state.storeId : null;
  }, [state]);

  useEffect(() => {
    const fn = () => primeStoreOrderAlertAudio();
    document.addEventListener("pointerdown", fn, { once: true });
    return () => document.removeEventListener("pointerdown", fn);
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
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
      const store = sj.stores[0] as { id: string; store_name?: string };
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
      const refundRequestedCount = Math.max(0, Math.floor(Number(oj.meta?.refund_requested_count) || 0));
      const pendingAcceptCount = Math.max(0, Math.floor(Number(oj.meta?.pending_accept_count) || 0));
      const pendingDeliveryCount = Math.max(0, Math.floor(Number(oj.meta?.pending_delivery_count) || 0));

      if (silent) {
        const prev = prevPendingDeliveryRef.current;
        if (prev !== null && pendingDeliveryCount > prev) {
          playDeliveryOrderAlertDebounced(store.id);
        }
        prevPendingDeliveryRef.current = pendingDeliveryCount;
      } else {
        prevPendingDeliveryRef.current = pendingDeliveryCount;
      }

      setState({
        kind: "ok",
        storeId: store.id,
        storeName: String(store.store_name ?? "내 매장"),
        orders: (oj.orders ?? []) as OrderRow[],
        refundRequestedCount,
        pendingAcceptCount,
        pendingDeliveryCount,
      });
    } catch {
      if (!silent) setState({ kind: "error", message: "network_error" });
    }
  }, []);

  useEffect(() => {
    void load();
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

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  const pollStoreId = state.kind === "ok" ? state.storeId : null;
  useSupabaseStoreOrdersRealtime(pollStoreId, {
    debounceMs: 400,
    onChange: () => void load({ silent: true }),
    onInsert: (row) => {
      if (String(row.fulfillment_type ?? "") !== "local_delivery") return;
      playDeliveryOrderAlertDebounced(alertStoreIdRef.current);
    },
  });

  useSupabaseStoreOrderDeliveriesRealtime(
    pollStoreId ? { kind: "store", storeId: pollStoreId } : null,
    { debounceMs: 450, onChange: () => void load({ silent: true }) }
  );

  useEffect(() => {
    if (!pollStoreId) return;
    let inFlight = false;
    const safeSilentLoad = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (inFlight) return;
      inFlight = true;
      void load({ silent: true }).finally(() => {
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
      intervalId = window.setInterval(safeSilentLoad, 45_000);
    };
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        safeSilentLoad();
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
    body = <p className="text-sm text-sam-muted">불러오는 중…</p>;
  } else if (state.kind === "unauth") {
    body = (
      <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">
        <p>로그인 후 매장 주문을 확인하고 바로 고객과 연결할 수 있습니다.</p>
        <Link href={loginHref} className="mt-3 inline-flex rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white">
          로그인하고 주문 보기
        </Link>
      </div>
    );
  } else if (state.kind === "config") {
    body = <p className="text-sm text-sam-muted">서버 설정을 확인해 주세요.</p>;
  } else if (state.kind === "no_store") {
    body = (
      <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">
        <p>등록된 매장이 없습니다.</p>
        <Link href="/stores/owner/apply" className="mt-2 inline-block text-signature">
          매장 신청
        </Link>
      </div>
    );
  } else if (state.kind === "error") {
    body = (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
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
  } else {
    body = (
      <div className={OWNER_STORE_STACK_Y_CLASS}>
        <div className="sticky top-0 z-10 -mx-1 mb-3 border-b border-[var(--biz-card-border)] bg-[var(--biz-app-bg)]/95 px-1 py-2 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 shadow-[var(--biz-card-shadow)]">
              <p className="text-[11px] font-medium text-[var(--biz-text-muted)]">신규 주문</p>
              <p className="text-[18px] font-bold tabular-nums text-[var(--biz-text)]">{summaryCounts.pending}</p>
            </div>
            <div className="rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 shadow-[var(--biz-card-shadow)]">
              <p className="text-[11px] font-medium text-[var(--biz-text-muted)]">조리중</p>
              <p className="text-[18px] font-bold tabular-nums text-[var(--biz-text)]">{summaryCounts.preparing}</p>
            </div>
            <div className="rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 shadow-[var(--biz-card-shadow)]">
              <p className="text-[11px] font-medium text-[var(--biz-text-muted)]">배달중</p>
              <p className="text-[18px] font-bold tabular-nums text-[var(--biz-text)]">{summaryCounts.delivering}</p>
            </div>
            <div className="rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 shadow-[var(--biz-card-shadow)]">
              <p className="text-[11px] font-medium text-[var(--biz-text-muted)]">오늘 완료</p>
              <p className="text-[18px] font-bold tabular-nums text-[var(--biz-primary)]">{summaryCounts.doneToday}</p>
            </div>
          </div>
          <div className="mt-2 flex min-h-[48px] w-full flex-nowrap rounded-[14px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-1 shadow-sm">
            {OWNER_ORDER_TABS.map((t) => {
              const active = tab === t.id;
              const badge =
                t.id === "new" && tabBadges.new > 0
                  ? tabBadges.new
                  : t.id === "progress" && tabBadges.progress > 0
                    ? tabBadges.progress
                    : null;
              return (
                <Link
                  key={t.id}
                  href={buildStoreOrdersHref({ storeId: state.storeId, tab: t.id as StoreOrderTabId })}
                  scroll={false}
                  className={[
                    Biz.tabBase,
                    "relative flex min-h-[48px] flex-1 flex-col items-center justify-center rounded-[12px] px-1",
                    active ? Biz.tabActive : "",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-1">
                    {t.label}
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
            {state.pendingDeliveryCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 sam-text-xxs font-semibold text-rose-950">
                배달 대기 {state.pendingDeliveryCount}
              </span>
            ) : null}
            {state.pendingAcceptCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 sam-text-xxs font-semibold text-violet-950">
                접수 대기 {state.pendingAcceptCount}
              </span>
            ) : null}
            {state.refundRequestedCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 sam-text-xxs font-semibold text-amber-950">
                환불 요청 {state.refundRequestedCount}건
              </span>
            ) : null}
          </div>
        </div>
        {state.pendingDeliveryCount > 0 ? (
          <div
            className="rounded-ui-rect border border-rose-200 bg-rose-50/95 px-3 py-2.5 sam-text-helper leading-relaxed text-rose-950"
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold">배달 주문이 접수되었습니다.</p>
          </div>
        ) : null}
        {state.pendingAcceptCount > 0 && state.pendingDeliveryCount === 0 ? (
          <div className="rounded-ui-rect border border-violet-200 bg-violet-50/90 px-3 py-2 sam-text-helper text-violet-950">
            접수 대기 중인 주문이 {state.pendingAcceptCount}건 있습니다.
          </div>
        ) : null}
      {state.refundRequestedCount > 0 ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-3 py-2 sam-text-helper text-amber-950">
          구매자 환불 요청이 접수된 주문이 있습니다. 관리자에서 승인 시 상태가 갱신됩니다.
        </div>
      ) : null}
      {state.orders.length === 0 ? (
        <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted shadow-sm">
          <p className="text-sam-fg">아직 주문이 없습니다.</p>
          <p className="mt-1">매장 정보와 메뉴를 점검한 뒤 공유하면 첫 주문을 더 빨리 받을 수 있습니다.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/stores/owner?storeId=${encodeURIComponent(state.storeId)}`}
              className="inline-flex rounded-ui-rect bg-signature px-4 py-2 font-semibold text-white"
            >
              매장 운영 보기
            </Link>
            <Link
              href={`/stores/owner/profile?storeId=${encodeURIComponent(state.storeId)}`}
              className="inline-flex rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 font-medium text-sam-fg"
            >
              매장 정보 점검
            </Link>
          </div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-[16px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-6 text-[14px] text-[var(--biz-text-muted)] shadow-[var(--biz-card-shadow)]">
          <p className="font-semibold text-[var(--biz-text)]">이 탭에 표시할 주문이 없습니다.</p>
          <p className="mt-1">다른 탭을 선택해 보세요.</p>
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
      {state.kind === "ok" && chatModal ? (
        <OwnerStoreOrderChatModal
          open
          onClose={() => setChatModal(null)}
          storeId={state.storeId}
          orderId={chatModal.orderId}
          anchorTopPx={chatModal.anchorTopPx}
        />
      ) : null}
    </div>
  );
}
