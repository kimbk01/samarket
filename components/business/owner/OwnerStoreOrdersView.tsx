"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BusinessSubPageHeader } from "@/components/business/BusinessSubPageHeader";
import { playDeliveryOrderAlertDebounced } from "@/lib/business/delivery-order-alert-debounce";
import { primeStoreOrderAlertAudio } from "@/lib/business/store-order-alert-sound";
import { useSupabaseStoreOrdersRealtime } from "@/hooks/useSupabaseStoreOrdersRealtime";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { allowedOrderTransitions } from "@/lib/stores/order-status-transitions";
import {
  BUYER_ORDER_STATUS_LABEL,
  labelForOwnerTransition,
} from "@/lib/stores/store-order-process-criteria";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { formatMoneyPhp } from "@/lib/utils/format";
import { KASAMA_OWNER_HUB_BADGE_REFRESH } from "@/lib/chats/chat-channel-events";
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { fetchStoreOrdersListDeduped } from "@/lib/stores/fetch-store-orders-list-deduped";
import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
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

const FULFILL_LABEL: Record<string, string> = {
  pickup: "포장 픽업",
  local_delivery: "배달",
  shipping: "배달",
};

const STATUS_LABEL: Record<string, string> = { ...BUYER_ORDER_STATUS_LABEL };

function OwnerOrderActions({
  storeId,
  order,
  onUpdated,
}: {
  storeId: string;
  order: OrderRow;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const next = allowedOrderTransitions(order.order_status, order.fulfillment_type);
  if (order.order_status === "refund_requested") {
    return (
      <p className="mt-3 border-t border-amber-100 bg-amber-50/80 px-2 py-2 text-[11px] text-amber-950">
        구매자가 환불을 요청했습니다. 관리자 화면(매장 주문)에서 승인하면 재고·정산이 반영됩니다.
      </p>
    );
  }
  if (order.order_status === "refunded") {
    return (
      <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] text-gray-500">환불 처리된 주문입니다.</p>
    );
  }
  if (next.length === 0) {
    return (
      <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] text-gray-400">
        이 주문은 더 이상 상태를 바꿀 수 없습니다.
      </p>
    );
  }

  async function patch(status: string) {
    setErr(null);
    setBusy(status);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(order.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_status: status }),
        }
      );
      const j = await res.json();
      if (!j?.ok) {
        const code = typeof j?.error === "string" ? j.error : "update_failed";
        setErr(code);
        return;
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(KASAMA_OWNER_HUB_BADGE_REFRESH));
      }
      onUpdated();
    } catch {
      setErr("network_error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {err ? <p className="mb-2 text-xs text-red-600">{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy !== null}
            onClick={() => void patch(s)}
            className={
              s === "cancelled"
                ? "rounded-lg border border-red-200 bg-white px-3 py-2 text-[13px] font-medium text-red-700 disabled:opacity-50"
                : "rounded-lg bg-signature px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
            }
          >
            {busy === s
              ? "처리 중…"
              : labelForOwnerTransition(order.order_status, s, order.fulfillment_type)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OwnerStoreOrdersView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ownerNotifAckRef = useRef(false);

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
    const fn = () => primeStoreOrderAlertAudio(alertStoreIdRef.current ?? undefined);
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

  const headerBadge =
    state.kind === "ok" ? state.pendingAcceptCount + state.refundRequestedCount : undefined;

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
        <ul className={OWNER_STORE_STACK_Y_CLASS}>
          {state.orders.map((o) => {
            const isHighlight = highlightOrderId === o.id;
            return (
            <li
              key={o.id}
              id={`owner-order-${o.id}`}
              className={`rounded-xl border p-4 shadow-sm ${
                o.order_status === "refund_requested"
                  ? "border-amber-300 bg-amber-50/40"
                  : o.fulfillment_type === "local_delivery" && o.order_status === "pending"
                    ? "border-rose-200 bg-rose-50/30"
                    : "border-gray-100 bg-white"
              } ${isHighlight ? "ring-2 ring-signature ring-offset-2 ring-offset-gray-50" : ""}`}
            >
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-medium text-gray-900">{o.order_no}</span>
                <span className="text-xs text-gray-400">
                  {new Date(o.created_at).toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                구매자 ID: <span className="font-mono text-[11px]">{o.buyer_user_id}</span>
              </p>
              <p className="mt-2 text-lg font-bold text-gray-900">{formatMoneyPhp(o.payment_amount)}</p>
              <p className="mt-1 text-xs text-gray-500">
                {FULFILL_LABEL[o.fulfillment_type] ?? o.fulfillment_type} ·{" "}
                {STATUS_LABEL[o.order_status] ?? o.order_status}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                결제: {formatBuyerPaymentDisplay(o.buyer_payment_method, o.buyer_payment_method_detail)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {o.order_status === "refund_requested" ? (
                  <span className="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
                    환불 요청
                  </span>
                ) : null}
              </div>
              {(o.order_status === "ready_for_pickup" ||
                o.order_status === "delivering" ||
                o.order_status === "arrived") &&
              o.auto_complete_at ? (
                <p className="mt-2 text-[11px] text-gray-500">
                  자동 완료 예정:{" "}
                  <span className="font-medium text-gray-700">
                    {new Date(o.auto_complete_at).toLocaleString("ko-KR")}
                  </span>
                </p>
              ) : null}
              {(o.fulfillment_type === "local_delivery" || o.fulfillment_type === "shipping") &&
              (o.delivery_address_summary?.trim() || o.delivery_address_detail?.trim()) ? (
                <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">배송지</p>
                  <p className="mt-1 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-gray-900">
                    {[o.delivery_address_summary?.trim(), o.delivery_address_detail?.trim()]
                      .filter(Boolean)
                      .join("\n")}
                  </p>
                </div>
              ) : null}
              {o.buyer_note?.trim() ? (
                <div className="mt-2 rounded-lg border border-signature/30 bg-signature/5 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-signature">고객 요청 사항</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-900">
                    {o.buyer_note.trim()}
                  </p>
                </div>
              ) : null}
              <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm text-gray-700">
                {o.items.map((it) => {
                  const opt = orderLineOptionsSummary(it.options_snapshot_json);
                  return (
                    <li key={it.id} className="flex justify-between gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {it.product_title_snapshot} × {it.qty}
                        </span>
                        {opt ? (
                          <span className="mt-0.5 block text-[11px] text-gray-500">{opt}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0">{formatMoneyPhp(it.subtotal)}</span>
                    </li>
                  );
                })}
              </ul>
              <OwnerOrderActions storeId={state.storeId} order={o} onUpdated={() => void load()} />
            </li>
            );
          })}
        </ul>
      )}
      </div>
    );
  }

  return (
    <>
      <BusinessSubPageHeader title="주문 관리" backHref="/my/business" titleBadge={headerBadge} />
      <div className="px-4 pt-4">{body}</div>
    </>
  );
}
