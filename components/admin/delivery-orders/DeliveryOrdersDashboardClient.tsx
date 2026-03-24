"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  defaultOrderListFilters,
  type AdminDeliveryOrder,
  type OrderListFilters,
} from "@/lib/admin/delivery-orders-mock/types";
import { adminDeliveryOrderMatchesFilters } from "@/lib/admin/delivery-orders-mock/mock-store";
import { DeliveryOrdersKpiCards } from "./DeliveryOrdersKpiCards";
import { DeliveryOrdersProgressPanel } from "./DeliveryOrdersProgressPanel";
import { OrderFilterBar } from "./OrderFilterBar";
import { OrderTable } from "./OrderTable";
import { fetchAdminStoreOrdersListDeduped } from "@/lib/admin/fetch-admin-store-orders-deduped";

export function DeliveryOrdersDashboardClient() {
  const [filters, setFilters] = useState<OrderListFilters>(defaultOrderListFilters);
  const [dbOrders, setDbOrders] = useState<AdminDeliveryOrder[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [listHiddenIds, setListHiddenIds] = useState<Set<string>>(() => new Set());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadDbOrders = useCallback(async () => {
    setDbLoading(true);
    setDbError(null);
    try {
      const { status, json: jRaw } = await fetchAdminStoreOrdersListDeduped();
      const j = jRaw as {
        ok?: boolean;
        error?: string;
        orders?: { admin_delivery?: AdminDeliveryOrder }[];
      };
      if (status < 200 || status >= 300 || j?.ok === false) {
        setDbOrders([]);
        setDbError(typeof j?.error === "string" ? j.error : `HTTP ${status}`);
        return;
      }
      const list = Array.isArray(j.orders) ? j.orders : [];
      const mapped = list
        .map((x) => x?.admin_delivery)
        .filter((x): x is AdminDeliveryOrder => x != null && typeof x.id === "string");
      setDbOrders(mapped);
    } catch {
      setDbOrders([]);
      setDbError("network_error");
    } finally {
      setDbLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDbOrders();
  }, [loadDbOrders]);

  useEffect(() => {
    const refetchIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadDbOrders();
    };
    document.addEventListener("visibilitychange", refetchIfVisible);
    const id = window.setInterval(refetchIfVisible, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", refetchIfVisible);
      clearInterval(id);
    };
  }, [loadDbOrders]);

  const filteredRows = useMemo(
    () => dbOrders.filter((o) => adminDeliveryOrderMatchesFilters(o, filters)),
    [dbOrders, filters]
  );

  const visibleRows = useMemo(
    () => filteredRows.filter((o) => !listHiddenIds.has(o.id)),
    [filteredRows, listHiddenIds]
  );

  const handleToggleRow = useCallback((orderId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }, []);

  const handleToggleAllVisible = useCallback(
    (checked: boolean) => {
      const ids = visibleRows.map((o) => o.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) ids.forEach((id) => next.add(id));
        else ids.forEach((id) => next.delete(id));
        return next;
      });
    },
    [visibleRows]
  );

  const hideSelectedFromListOnly = useCallback(() => {
    if (selectedIds.size === 0) return;
    setListHiddenIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedIds(new Set());
    setActionMessage("선택한 주문을 이 화면 목록에서만 숨겼습니다. 브라우저 새로고침(F5) 시 다시 보입니다.");
  }, [selectedIds]);

  const deleteSelectedFromDb = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    if (
      !window.confirm(
        `선택 ${ids.length}건을 DB(store_orders)에서 영구 삭제합니다.\n연결된 품목·정산·리뷰·주문 채팅방 등이 함께 정리될 수 있습니다. 계속할까요?`
      )
    ) {
      return;
    }
    setActionBusy(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/store-orders/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds: ids }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deleted?: string[];
        errors?: { id: string; message: string }[];
        error?: string;
      };
      if (!res.ok) {
        setActionMessage(data.error ?? "삭제 요청에 실패했습니다.");
        return;
      }
      const deleted: string[] = Array.isArray(data.deleted) ? data.deleted : [];
      const deletedSet = new Set(deleted);
      setDbOrders((prev) => prev.filter((o) => !deletedSet.has(o.id)));
      setListHiddenIds((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
      if (data.errors?.length) {
        setActionMessage(
          deleted.length > 0
            ? `${deleted.length}건 DB 삭제 완료. 실패 ${data.errors.length}건: ${data.errors
                .map((e) => `${e.id.slice(0, 8)}… ${e.message}`)
                .join(" / ")}`
            : `삭제 실패 ${data.errors.length}건: ${data.errors
                .map((e) => `${e.id.slice(0, 8)}… ${e.message}`)
                .join(" / ")}`
        );
      } else {
        setActionMessage(`${deleted.length}건을 DB에서 삭제했습니다.`);
      }
    } catch {
      setActionMessage("네트워크 오류로 삭제에 실패했습니다.");
    } finally {
      setActionBusy(false);
    }
  }, [selectedIds]);

  const sub = [
    { href: "/admin/delivery-orders", label: "주문 목록" },
    { href: "/admin/store-orders", label: "매장 주문(액션)" },
    { href: "/admin/order-chats", label: "주문 채팅" },
    { href: "/admin/order-notifications", label: "운영 알림" },
    { href: "/admin/delivery-orders/simulation", label: "시뮬(테스트용)" },
    { href: "/admin/delivery-orders/cancellations", label: "취소" },
    { href: "/admin/delivery-orders/refunds", label: "환불" },
    { href: "/admin/delivery-orders/settlements", label: "정산" },
    { href: "/admin/delivery-orders/reports", label: "신고·분쟁" },
    { href: "/admin/delivery-orders/logs", label: "로그" },
  ];

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader
        title="배달·포장 주문 (실데이터)"
        description="Supabase store_orders 원장만 표시합니다. 결제·환불 등 처리는 «매장 주문(액션)»에서 진행하세요. 인메모리 시뮬(FD-)은 «시뮬(테스트용)»에서만 다룹니다."
      />
      <AdminCard title="데이터 원장">
        <p className="text-[13px] leading-relaxed text-gray-700">
          이 화면 목록은 <code className="rounded bg-gray-100 px-1 text-[11px]">store_orders</code> 와 품목 스냅샷을
          API로 불러온 결과입니다.{" "}
          <Link href="/admin/store-orders" className="font-medium text-signature underline">
            매장 주문(액션)
          </Link>
          과 <strong>같은 DB</strong>입니다. 한쪽에서 <strong>DB에서 삭제</strong>하면 서버에는 바로 반영되고, 다른
          탭으로 돌아오면 자동으로 목록을 다시 불러오며(탭 복귀 시), 보이는 동안 약 30초마다도 갱신됩니다.
        </p>
        <p className="mt-2 text-[12px] text-gray-600">
          <strong className="text-gray-800">목록에서만 제거</strong>는 이 브라우저 세션에서 표시만 숨깁니다.{" "}
          <strong className="text-red-800">DB에서 삭제</strong>는 원장에서 영구 삭제합니다.
        </p>
        <p className="mt-2 text-[12px] text-gray-500">
          <Link href="/admin/store-orders" className="text-signature underline">
            매장 주문(액션)으로 이동
          </Link>
        </p>
      </AdminCard>
      <nav className="mb-4 mt-4 flex flex-wrap gap-2 text-xs">
        {sub.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-full border border-gray-200 bg-white px-3 py-1 text-gray-700 hover:border-signature hover:text-signature"
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="mb-3">
        <button
          type="button"
          onClick={() => void loadDbOrders()}
          disabled={dbLoading}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 disabled:opacity-50"
        >
          {dbLoading ? "목록 갱신 중…" : "목록 새로고침"}
        </button>
      </div>

      {dbError ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
          주문 목록을 불러오지 못했습니다 ({dbError}). Supabase 설정·관리자 로그인을 확인하세요.
        </p>
      ) : null}

      <AdminCard title="KPI (현재 목록 기준 · 최대 500건)">
        <DeliveryOrdersKpiCards orders={dbOrders} />
      </AdminCard>

      <div className="mt-4">
        <DeliveryOrdersProgressPanel orders={dbOrders} filters={filters} onChange={setFilters} />
      </div>

      <div className="mt-4">
        <OrderFilterBar filters={filters} onChange={setFilters} />
      </div>

      <div className="mt-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">주문 목록</h2>
        <p className="mb-2 text-[12px] text-gray-500">
          전체 <strong>{dbOrders.length}</strong>건 · 필터 일치 <strong>{filteredRows.length}</strong>건 · 표시{" "}
          <strong>{visibleRows.length}</strong>건
          {dbLoading ? " · 갱신 중…" : ""}
        </p>
        {!dbLoading && (filteredRows.length > 0 || dbOrders.length > 0) ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px]">
            <span className="text-gray-600">
              선택 <strong className="text-gray-900">{selectedIds.size}</strong>건
            </span>
            <span className="hidden sm:inline text-gray-300">|</span>
            <button
              type="button"
              disabled={visibleRows.length === 0 || actionBusy}
              onClick={() => handleToggleAllVisible(true)}
              className="rounded border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
            >
              현재 목록 전체 선택
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || actionBusy}
              onClick={() => setSelectedIds(new Set())}
              className="rounded border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
            >
              선택 해제
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || actionBusy}
              onClick={hideSelectedFromListOnly}
              className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-40"
            >
              목록에서만 제거
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || actionBusy}
              onClick={() => void deleteSelectedFromDb()}
              className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 font-medium text-red-800 hover:bg-red-100 disabled:opacity-40"
            >
              DB에서 삭제
            </button>
          </div>
        ) : null}
        {actionMessage ? (
          <p className="mb-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-800">
            {actionMessage}
          </p>
        ) : null}
        {visibleRows.length === 0 && !dbLoading && filteredRows.length > 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">
            표시할 주문이 없습니다. 목록에서만 숨긴 상태라면 브라우저 새로고침(F5)으로 숨김이 초기화됩니다.
          </p>
        ) : (
          <OrderTable
            rows={visibleRows}
            selection={{
              selectedIds,
              onToggleRow: handleToggleRow,
              onToggleAllVisible: handleToggleAllVisible,
            }}
          />
        )}
      </div>
    </div>
  );
}
