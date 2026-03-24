"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MemberNotificationBell } from "@/components/member-orders/MemberNotificationBell";
import { MemberOrderStatusBadge } from "@/components/member-orders/MemberOrderStatusBadge";
import { MemberOrderTabs } from "@/components/member-orders/MemberOrderTabs";
import { MEMBER_STATUS_USER_MESSAGE } from "@/lib/member-orders/member-order-labels";
import type { MemberOrderStatus, MemberOrderTab } from "@/lib/member-orders/types";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";

type ItemRow = {
  id: string;
  product_title_snapshot: string;
  qty: number;
};

type OrderRow = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  total_amount: number;
  payment_amount: number;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note: string | null;
  created_at: string;
  auto_complete_at?: string | null;
  items?: ItemRow[];
};

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

function titleSummary(items: ItemRow[] | undefined) {
  if (!items?.length) return "—";
  const first = items[0]!.product_title_snapshot;
  const rest = items.length - 1;
  return rest > 0 ? `${first} 외 ${rest}건` : first;
}

function isDeliveryFulfillment(ft: string) {
  return ft === "local_delivery" || ft === "shipping";
}

function statusUserLine(status: string) {
  if (isMemberOrderStatus(status)) {
    return MEMBER_STATUS_USER_MESSAGE[status];
  }
  return BUYER_ORDER_STATUS_LABEL[status] ?? status;
}

function MyStoreOrderCard({
  order: o,
  detailHref,
  onCancelPending,
  cancelBusy,
}: {
  order: OrderRow;
  detailHref: string;
  onCancelPending?: (id: string) => void;
  cancelBusy?: boolean;
}) {
  const activeTab = [
    "pending",
    "accepted",
    "preparing",
    "delivering",
    "ready_for_pickup",
    "arrived",
  ].includes(o.order_status);
  const canCancelHere = o.order_status === "pending";
  const delivery = isDeliveryFulfillment(o.fulfillment_type);

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        activeTab ? "border-violet-200 ring-1 ring-violet-100" : "border-gray-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-gray-900">{o.store_name || "매장"}</p>
          <p className="font-mono text-[11px] text-gray-400">{o.order_no}</p>
          <p className="mt-1 text-xs text-gray-400">
            {new Date(o.created_at).toLocaleString("ko-KR")}
          </p>
        </div>
        {isMemberOrderStatus(o.order_status) ? (
          <MemberOrderStatusBadge status={o.order_status} />
        ) : (
          <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-bold text-gray-800">
            {BUYER_ORDER_STATUS_LABEL[o.order_status] ?? o.order_status}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
            delivery ? "bg-violet-50 text-violet-900" : "bg-teal-50 text-teal-900"
          }`}
        >
          {delivery ? "배달" : "포장"}
        </span>
        {o.buyer_note?.trim() ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
            요청있음
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-gray-700">{titleSummary(o.items)}</p>
      <p className="mt-2 text-lg font-bold text-gray-900">{formatMoneyPhp(o.payment_amount)}</p>
      <p className="mt-2 text-sm text-gray-600">{statusUserLine(o.order_status)}</p>

      {(o.order_status === "ready_for_pickup" ||
        o.order_status === "delivering" ||
        o.order_status === "arrived") &&
      o.auto_complete_at ? (
        <p className="mt-2 text-[11px] leading-snug text-gray-500">
          자동 완료 예정:{" "}
          <span className="font-medium text-gray-700">
            {new Date(o.auto_complete_at).toLocaleString("ko-KR")}
          </span>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={detailHref}
          className="flex-1 rounded-xl bg-gray-900 py-2.5 text-center text-sm font-semibold text-white"
        >
          상세보기
        </Link>
        {canCancelHere && onCancelPending ? (
          <button
            type="button"
            disabled={cancelBusy}
            onClick={() => onCancelPending(o.id)}
            className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
          >
            {cancelBusy ? "처리 중…" : "취소 요청"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function MyStoreOrdersView({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState<MemberOrderTab>("all");
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "unauth" }
    | { kind: "error"; message: string }
    | { kind: "ok"; orders: OrderRow[] }
  >({ kind: "loading" });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setState({ kind: "loading" });
    try {
      const res = await fetch("/api/me/store-orders", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        if (!silent) setState({ kind: "unauth" });
        return;
      }
      if (res.status === 503) {
        if (!silent) {
          setState({
            kind: "error",
            message: "supabase_unconfigured",
          });
        }
        return;
      }
      const json = await res.json();
      if (!json?.ok) {
        if (!silent) {
          setState({
            kind: "error",
            message: typeof json?.error === "string" ? json.error : "load_failed",
          });
        }
        return;
      }
      setState({ kind: "ok", orders: (json.orders ?? []) as OrderRow[] });
    } catch {
      if (!silent) setState({ kind: "error", message: "network_error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  const allSorted = useMemo(() => {
    if (state.kind !== "ok") return [];
    return [...state.orders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [state]);

  const counts = useMemo(() => tabCounts(allSorted), [allSorted]);
  const filtered = useMemo(() => filterByTab(allSorted, tab), [allSorted, tab]);

  const requestCancelPending = useCallback(
    async (orderId: string) => {
      if (!confirm("주문을 취소할까요? 매장이 아직 접수하지 않은 경우에만 가능합니다.")) return;
      setCancelBusyId(orderId);
      try {
        const res = await fetch(`/api/me/store-orders/${encodeURIComponent(orderId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancel: true }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || json?.ok === false) {
          const code = typeof json?.error === "string" ? json.error : "cancel_failed";
          const msg =
            code === "cannot_cancel_after_accepted"
              ? "매장이 접수한 뒤에는 여기서 취소할 수 없습니다."
              : `취소에 실패했습니다. (${code})`;
          setToast(msg);
          setTimeout(() => setToast(null), 3200);
          return;
        }
        setToast("주문이 취소되었어요.");
        setTimeout(() => setToast(null), 2800);
        await load({ silent: true });
      } catch {
        setToast("네트워크 오류가 발생했습니다.");
        setTimeout(() => setToast(null), 2800);
      } finally {
        setCancelBusyId(null);
      }
    },
    [load]
  );

  return (
    <div className={embedded ? "bg-gray-50 pb-6" : "min-h-screen bg-gray-50 pb-10"}>
      {!embedded ? (
        <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-2 py-2">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <AppBackButton preferHistoryBack backHref="/mypage" ariaLabel="이전 화면" />
            <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-gray-900">
              식당·배달 주문
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              <MemberNotificationBell />
              <button
                type="button"
                className="shrink-0 text-[11px] text-gray-500 underline"
                onClick={() => void load()}
              >
                새로고침
              </button>
            </div>
          </div>
          <p className="mx-auto max-w-lg px-3 pb-2 text-center text-[11px] text-gray-500">
            실매장 주문 내역입니다 · 상태는 매장 처리에 따라 여기에 반영돼요
          </p>
        </header>
      ) : null}

      <div className={`mx-auto max-w-lg space-y-4 px-3 ${embedded ? "pt-2" : "pt-4"}`}>
        {toast ? (
          <p className="rounded-xl bg-gray-900 px-3 py-2 text-center text-xs text-white">{toast}</p>
        ) : null}

        {state.kind === "loading" ? (
          <p className="py-12 text-center text-sm text-gray-500">불러오는 중…</p>
        ) : null}

        {state.kind === "unauth" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-center text-sm text-amber-950">
            로그인 후 매장 주문 내역을 확인할 수 있습니다.
          </p>
        ) : null}

        {state.kind === "error" ? (
          <div className="space-y-2">
            {state.message === "supabase_unconfigured" ? (
              <p className="text-sm text-amber-800">
                서버에 Supabase(매장 주문) 설정이 없어 목록을 불러올 수 없습니다.
              </p>
            ) : null}
            <p className="text-sm text-red-600">불러오지 못했습니다. ({state.message})</p>
            <button type="button" onClick={() => void load()} className="text-sm text-signature underline">
              다시 시도
            </button>
          </div>
        ) : null}

        {state.kind === "ok" ? (
          <>
            <MemberOrderTabs active={tab} onChange={setTab} counts={counts} />

            {!embedded ? (
              <p className="text-xs text-gray-500">
                <Link href="/orders?tab=chat" className="text-violet-700 underline">
                  주문 채팅 목록
                </Link>
                {" · "}
                실매장 주문(DB)은{" "}
                <Link href="/mypage/store-orders" className="text-violet-700 underline">
                  매장 주문
                </Link>
                에서 확인해요.
              </p>
            ) : null}

            {allSorted.length === 0 ? (
              <div className="rounded-xl bg-white p-6 text-center text-sm text-gray-600 shadow-sm ring-1 ring-gray-100">
                <p>아직 매장 주문이 없습니다.</p>
                <Link href="/stores" className="mt-3 inline-block text-signature">
                  매장 둘러보기
                </Link>
              </div>
            ) : (
              <ul className="space-y-4">
                {filtered.map((o) => (
                  <li key={o.id}>
                    <MyStoreOrderCard
                      order={o}
                      detailHref={
                        embedded
                          ? `/orders/store/${encodeURIComponent(o.id)}`
                          : `/my/store-orders/${encodeURIComponent(o.id)}`
                      }
                      onCancelPending={requestCancelPending}
                      cancelBusy={cancelBusyId === o.id}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
