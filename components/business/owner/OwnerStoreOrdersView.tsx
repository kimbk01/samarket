"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { useSupabaseStoreOrdersRealtime } from "@/hooks/useSupabaseStoreOrdersRealtime";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
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

/** 주문 카드 본문 — 매장 관리 폼과 동일 계열(14px 라벨/본문) */
const OC_LBL = "text-[14px] font-medium leading-snug text-gray-600";
const OC_TX =
  "text-[14px] font-normal leading-normal text-gray-900 [overflow-wrap:anywhere] [word-break:break-word]";
const OC_TX_MUTED =
  "text-[14px] font-normal leading-normal text-gray-500 [overflow-wrap:anywhere] [word-break:break-word]";
const OC_TX_SM = "text-[13px] font-normal leading-snug text-gray-500 [overflow-wrap:anywhere]";
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
  auto_complete_at?: string | null;
  items: ItemRow[];
};

function formatBuyerPhoneDisplay(raw: string | null | undefined): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s.length ? s : null;
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
  "inline-flex w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border border-signature/35 bg-white px-3 py-3 text-center text-[14px] font-semibold leading-snug text-gray-900 shadow-sm transition hover:bg-signature/5 [overflow-wrap:anywhere] [word-break:break-word]";

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

  return (
    <li
      id={`owner-order-${order.id}`}
      className={`scroll-mt-[4.75rem] w-full min-w-0 overflow-hidden rounded-xl border p-3 shadow-sm sm:p-4 ${
        order.order_status === "refund_requested"
          ? "border-amber-300 bg-amber-50/40"
          : order.fulfillment_type === "local_delivery" && order.order_status === "pending"
            ? "border-rose-200 bg-rose-50/30"
            : "border-gray-100 bg-white"
      } ${isHighlight ? "ring-2 ring-signature ring-offset-2 ring-offset-gray-50" : ""}`}
    >
      <div className="flex min-w-0 flex-nowrap items-start justify-between gap-2">
        <span className={`min-w-0 flex-1 break-all font-semibold ${OC_TX}`}>{order.order_no}</span>
        <span className={`max-w-[48%] shrink-0 text-right tabular-nums ${OC_TX_SM}`}>
          {new Date(order.created_at).toLocaleString("ko-KR")}
        </span>
      </div>

      <div
        data-owner-order-gray
        className="mt-3 w-full min-w-0 rounded-lg border border-gray-100 bg-gray-50/90 px-3 py-3.5 sm:px-4 sm:py-4"
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

      <p className={`mt-3 text-[18px] font-bold leading-tight text-gray-900`}>
        {formatMoneyPhp(order.payment_amount)}
      </p>
      <p className={`mt-1.5 ${OC_TX_SM}`}>
        {FULFILL_LABEL[order.fulfillment_type] ?? order.fulfillment_type} ·{" "}
        {STATUS_LABEL[order.order_status] ?? order.order_status}
      </p>
      <p className={`mt-1 ${OC_TX}`}>
        결제 {formatBuyerPaymentDisplay(order.buyer_payment_method, order.buyer_payment_method_detail)}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {order.order_status === "refund_requested" ? (
          <span className="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
            환불 요청
          </span>
        ) : null}
      </div>
      {(order.order_status === "ready_for_pickup" ||
        order.order_status === "delivering" ||
        order.order_status === "arrived") &&
      order.auto_complete_at ? (
        <p className={`mt-2 ${OC_TX_SM}`}>
          자동 완료 예정:{" "}
          <span className="font-medium text-gray-700">
            {new Date(order.auto_complete_at).toLocaleString("ko-KR")}
          </span>
        </p>
      ) : null}
      {(order.fulfillment_type === "local_delivery" || order.fulfillment_type === "shipping") &&
      (order.delivery_address_summary?.trim() || order.delivery_address_detail?.trim()) ? (
        <div className="mt-2 w-full min-w-0 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5">
          <p className={OC_LBL}>배송지</p>
          <p className={`mt-1 whitespace-pre-wrap break-words ${OC_TX}`}>
            {[order.delivery_address_summary?.trim(), order.delivery_address_detail?.trim()]
              .filter(Boolean)
              .join("\n")}
          </p>
        </div>
      ) : null}
      {order.buyer_note?.trim() ? (
        <div className="mt-2 w-full min-w-0 rounded-lg border border-signature/30 bg-signature/5 px-3 py-2.5">
          <p className="text-[14px] font-medium text-signature">고객 요청 사항</p>
          <p className={`mt-1 whitespace-pre-wrap ${OC_TX}`}>{order.buyer_note.trim()}</p>
        </div>
      ) : null}
      <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
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
        <div className="mt-3 border-t border-gray-100 pt-3">{noticeFooter}</div>
      ) : null}

      {ownerOrderHasTransitionButtons({
        id: order.id,
        order_status: order.order_status,
        fulfillment_type: order.fulfillment_type,
      }) ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
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

export function OwnerStoreOrdersView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const onStoreOrderInsert = useCallback((row: Record<string, unknown>) => {
    if (String(row.fulfillment_type ?? "") !== "local_delivery") return;
    playDeliveryOrderAlertDebounced(alertStoreIdRef.current);
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
        const base = pathname ?? "/my/business/store-orders";
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
  useSupabaseStoreOrdersRealtime(pollStoreId, onStoreOrderInsert);

  useEffect(() => {
    if (!pollStoreId) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void load({ silent: true });
      }
    }, 25_000);
    return () => window.clearInterval(id);
  }, [pollStoreId, load]);

  let body: ReactNode;
  if (state.kind === "loading") {
    body = <p className="text-sm text-gray-500">불러오는 중…</p>;
  } else if (state.kind === "unauth") {
    body = <p className="text-sm text-gray-600">로그인이 필요합니다.</p>;
  } else if (state.kind === "config") {
    body = <p className="text-sm text-gray-600">서버 설정을 확인해 주세요.</p>;
  } else if (state.kind === "no_store") {
    body = (
      <div className="rounded-xl bg-white p-6 text-sm text-gray-600 shadow-sm">
        <p>등록된 매장이 없습니다.</p>
        <Link href="/my/business/apply" className="mt-2 inline-block text-signature">
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">{state.storeName}</p>
          <div className="flex flex-wrap items-center gap-2">
            {state.pendingDeliveryCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-950">
                배달 대기 {state.pendingDeliveryCount}
              </span>
            ) : null}
            {state.pendingAcceptCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-950">
                접수 대기 {state.pendingAcceptCount}
              </span>
            ) : null}
            {state.refundRequestedCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950">
                환불 요청 {state.refundRequestedCount}건
              </span>
            ) : null}
          </div>
        </div>
        {state.pendingDeliveryCount > 0 ? (
          <div
            className="rounded-xl border border-rose-200 bg-rose-50/95 px-3 py-2.5 text-[12px] leading-relaxed text-rose-950"
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold">배달 주문이 접수되었습니다.</p>
          </div>
        ) : null}
        {state.pendingAcceptCount > 0 && state.pendingDeliveryCount === 0 ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50/90 px-3 py-2 text-[12px] text-violet-950">
            접수 대기 중인 주문이 {state.pendingAcceptCount}건 있습니다.
          </div>
        ) : null}
      {state.refundRequestedCount > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-[12px] text-amber-950">
          구매자 환불 요청이 접수된 주문이 있습니다. 관리자에서 승인 시 상태가 갱신됩니다.
        </div>
      ) : null}
      {state.orders.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-sm text-gray-500 shadow-sm">아직 주문이 없습니다.</p>
      ) : (
        <ul className={`${OWNER_STORE_STACK_Y_CLASS} w-full min-w-0`}>
          {state.orders.map((o) => (
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
