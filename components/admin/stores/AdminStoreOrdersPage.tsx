"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { fetchAdminStoreOrdersQueryDeduped } from "@/lib/admin/fetch-admin-store-orders-query-deduped";
import { formatMoneyPhp } from "@/lib/utils/format";

type Row = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  buyer_user_id: string;
  payment_amount: number;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  created_at: string;
};

const ORDER_LABEL: Record<string, string> = {
  pending: "접수 대기",
  accepted: "주문확인",
  preparing: "상품준비",
  ready_for_pickup: "픽업준비",
  delivering: "배송중",
  arrived: "배송지도착",
  completed: "주문완료",
  cancelled: "취소",
  refund_requested: "환불요청",
  refunded: "환불됨",
};

type OrderFilters = {
  orderId: string;
  orderNo: string;
  orderStatus: string;
};

const emptyFilters: OrderFilters = {
  orderId: "",
  orderNo: "",
  orderStatus: "",
};

const ORDER_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "주문 전체" },
  { value: "pending", label: ORDER_LABEL.pending },
  { value: "accepted", label: ORDER_LABEL.accepted },
  { value: "preparing", label: ORDER_LABEL.preparing },
  { value: "ready_for_pickup", label: ORDER_LABEL.ready_for_pickup },
  { value: "delivering", label: ORDER_LABEL.delivering },
  { value: "arrived", label: ORDER_LABEL.arrived },
  { value: "completed", label: ORDER_LABEL.completed },
  { value: "cancelled", label: ORDER_LABEL.cancelled },
  { value: "refund_requested", label: ORDER_LABEL.refund_requested },
  { value: "refunded", label: ORDER_LABEL.refunded },
];

type Props = {
  /** URL 쿼리로 초기 필터 전달 */
  initialFilters?: Partial<OrderFilters>;
};

function buildOrdersQueryString(f: OrderFilters) {
  const params = new URLSearchParams();
  const oid = f.orderId.trim();
  const ono = f.orderNo.trim();
  const os = f.orderStatus.trim();
  if (oid) params.set("order_id", oid);
  if (ono) params.set("order_no", ono);
  if (os) params.set("order_status", os);
  return params.toString();
}

/** 적용된 필터와 동일 조건으로 `/api/admin/store-orders/export` 호출 */
function CsvExportLink({ filters }: { filters: OrderFilters }) {
  const qs = buildOrdersQueryString(filters);
  const href = `/api/admin/store-orders/export${qs ? `?${qs}` : ""}`;
  return (
    <a
      href={href}
      className="inline-flex items-center rounded border border-gray-300 bg-white px-3 py-1.5 text-gray-800 hover:bg-gray-100"
      download
    >
      CSV 내려받기
    </a>
  );
}

export function AdminStoreOrdersPage({ initialFilters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrlOrderIdRef = useRef<string | null>(null);
  const headerSelectRef = useRef<HTMLInputElement>(null);

  const initial: OrderFilters = {
    orderId: (initialFilters?.orderId ?? "").trim(),
    orderNo: (initialFilters?.orderNo ?? "").trim(),
    orderStatus: (initialFilters?.orderStatus ?? "").trim(),
  };
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const hasUrlInitial =
    Boolean(initial.orderId) || Boolean(initial.orderNo) || Boolean(initial.orderStatus);
  const [applied, setApplied] = useState<OrderFilters>(() => (hasUrlInitial ? initial : emptyFilters));
  const [draft, setDraft] = useState<OrderFilters>(() => (hasUrlInitial ? initial : emptyFilters));

  const fetchWith = useCallback(async (f: OrderFilters) => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildOrdersQueryString(f);
      const { status, json: raw } = await fetchAdminStoreOrdersQueryDeduped(qs);
      const json = raw as { ok?: boolean; error?: string; orders?: Row[] };
      if (status === 403) {
        setError("관리자 권한이 없습니다.");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(typeof json?.error === "string" ? json.error : "load_failed");
        setRows([]);
        return;
      }
      setRows(json.orders ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWith(applied);
  }, [applied, fetchWith]);

  /** 배달·포장 표와 같은 DB — 다른 탭에서 삭제해도 이 탭은 캐시된 목록을 들고 있을 수 있어, 탭 복귀·주기 갱신으로 맞춤 */
  useEffect(() => {
    const refetchIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void fetchWith(applied);
    };
    document.addEventListener("visibilitychange", refetchIfVisible);
    const interval = window.setInterval(refetchIfVisible, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", refetchIfVisible);
      window.clearInterval(interval);
    };
  }, [applied, fetchWith]);

  const urlOrderId = searchParams.get("order_id")?.trim() ?? "";
  useEffect(() => {
    if (urlOrderId === lastUrlOrderIdRef.current) return;
    lastUrlOrderIdRef.current = urlOrderId || null;
    if (!urlOrderId) return;
    setDraft((d) => ({ ...d, orderId: urlOrderId }));
    setApplied((d) => ({ ...d, orderId: urlOrderId }));
  }, [urlOrderId]);

  const applyFilters = useCallback(() => {
    const next = { ...draft };
    setApplied(next);
    setActionMessage(null);
    const qs = buildOrdersQueryString(next);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [draft, pathname, router]);

  const refreshList = useCallback(() => {
    void fetchWith(applied);
  }, [applied, fetchWith]);

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) rows.forEach((r) => next.add(r.id));
        else rows.forEach((r) => next.delete(r.id));
        return next;
      });
    },
    [rows]
  );

  const deleteSelectedFromDb = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    if (
      !window.confirm(
        `선택 ${ids.length}건을 DB(store_orders)에서 영구 삭제합니다.\n연결된 품목·채팅 등이 함께 정리될 수 있습니다. 계속할까요?`
      )
    ) {
      return;
    }
    setBulkBusy(true);
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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
      setRows((prev) => prev.filter((r) => !deletedSet.has(r.id)));
      if (data.errors?.length) {
        setActionMessage(
          deleted.length > 0
            ? `${deleted.length}건 삭제. 실패 ${data.errors.length}건`
            : `삭제 실패 ${data.errors.length}건`
        );
      } else {
        setActionMessage(`${deleted.length}건을 DB에서 삭제했습니다.`);
      }
      await fetchWith(applied);
    } catch {
      setActionMessage("네트워크 오류로 삭제에 실패했습니다.");
    } finally {
      setBulkBusy(false);
    }
  }, [applied, fetchWith, selectedIds]);

  const approveRefund = useCallback(
    async (id: string) => {
      if (
        !window.confirm(
          "환불을 승인할까요? 주문이 refunded로 바뀌고 재고가 복구되며 예정 정산이 취소됩니다."
        )
      )
        return;
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch(`/api/admin/store-orders/${encodeURIComponent(id)}/approve-refund`, {
          method: "POST",
          credentials: "include",
        });
        const json = await res.json();
        if (!json?.ok) {
          setError(json?.error ?? "approve_refund_failed");
          return;
        }
        await fetchWith(applied);
      } catch {
        setError("network_error");
      } finally {
        setBusyId(null);
      }
    },
    [applied, fetchWith]
  );

  const allRowsSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someRowsSelected = rows.some((r) => selectedIds.has(r.id));
  useEffect(() => {
    const el = headerSelectRef.current;
    if (el) el.indeterminate = someRowsSelected && !allRowsSelected;
  }, [someRowsSelected, allRowsSelected]);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="매장 주문" />
      <nav className="flex flex-wrap gap-2 text-[12px]">
        <Link
          href="/admin/delivery-orders"
          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-gray-700 hover:border-signature hover:text-signature"
        >
          배달·포장 주문(표·KPI)
        </Link>
        <Link
          href="/admin/delivery-orders/simulation"
          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-gray-700 hover:border-signature hover:text-signature"
        >
          FD- 시뮬(로컬)
        </Link>
      </nav>
      <p className="text-[13px] leading-relaxed text-gray-700">
        이 화면과{" "}
        <Link href="/admin/delivery-orders" className="font-medium text-signature underline">
          배달·포장 주문(표)
        </Link>
        는 <strong>같은 Supabase 테이블</strong>(
        <code className="rounded bg-gray-100 px-1 text-[12px]">store_orders</code>)을 봅니다.{" "}
        <strong>한쪽에서 DB 삭제</strong>하면 서버 데이터는 바로 없어지고, 다른 쪽 화면도{" "}
        <strong>이 탭으로 돌아오거나(자동 새로고침) 최대 약 30초 안에</strong> 같은 목록으로 맞춰집니다. 배달 표의
        &quot;목록에서만 제거&quot;는 이 브라우저에서만 숨김이라 DB와 무관합니다.
      </p>
      <p className="text-[12px] text-gray-500">
        사마켓 매장 주문은 앱 내 결제 없이 진행됩니다. 구매자가 &quot;환불 요청&quot;하면 주문 상태가{" "}
        <strong>환불요청</strong>으로 바뀌며, 아래 <strong>환불 승인</strong>으로 DB·재고·정산을 맞출 수 있습니다.
        대기만 보려면 주문 상태에서 &quot;환불요청&quot;을 고르거나 URL에{" "}
        <code className="rounded bg-gray-100 px-1">?order_status=refund_requested</code> 를 붙이면 됩니다.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-ui-rect border border-gray-200 bg-gray-50 p-3 text-[13px]">
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-600">order_id (UUID)</span>
          <input
            className="min-w-[220px] rounded border border-gray-300 bg-white px-2 py-1 font-mono text-[12px]"
            value={draft.orderId}
            onChange={(ev) => setDraft((d) => ({ ...d, orderId: ev.target.value }))}
            placeholder="UUID"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-600">주문번호 포함</span>
          <input
            className="min-w-[140px] rounded border border-gray-300 bg-white px-2 py-1"
            value={draft.orderNo}
            onChange={(ev) => setDraft((d) => ({ ...d, orderNo: ev.target.value }))}
            placeholder="SO-…"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-gray-600">주문 상태</span>
          <select
            className="min-w-[132px] rounded border border-gray-300 bg-white px-2 py-1"
            value={draft.orderStatus}
            onChange={(ev) => setDraft((d) => ({ ...d, orderStatus: ev.target.value }))}
          >
            {ORDER_FILTER_OPTIONS.map((o) => (
              <option key={o.value ? `ord-${o.value}` : "ord-all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-800 disabled:opacity-50"
          onClick={() => applyFilters()}
          disabled={loading}
        >
          {loading ? "조회 중…" : "조회"}
        </button>
        <button
          type="button"
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          onClick={() => refreshList()}
          disabled={loading}
        >
          목록 새로고침
        </button>
        <CsvExportLink filters={applied} />
      </div>
      <p className="text-[11px] text-gray-500">
        CSV는 위에서 <strong>조회</strong>에 적용된 필터와 동일합니다. 기본 최대 500건이며, URL에{" "}
        <code className="rounded bg-gray-100 px-1">limit=2000</code> 까지 지정할 수 있습니다. (UTF-8 BOM)
      </p>

      {error ? (
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {actionMessage ? (
        <p className="rounded-ui-rect border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-800">
          {actionMessage}
        </p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[13px]">
          <span className="text-gray-600">
            선택 <strong className="text-gray-900">{selectedIds.size}</strong>건
          </span>
          <button
            type="button"
            disabled={rows.length === 0 || bulkBusy}
            onClick={() => toggleSelectAll(true)}
            className="rounded border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            현재 목록 전체 선택
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0 || bulkBusy}
            onClick={() => setSelectedIds(new Set())}
            className="rounded border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-40"
          >
            선택 해제
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0 || bulkBusy}
            onClick={() => void deleteSelectedFromDb()}
            className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 font-medium text-red-800 hover:bg-red-100 disabled:opacity-40"
          >
            {bulkBusy ? "삭제 중…" : "DB에서 삭제"}
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">주문이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="w-10 px-2 py-2 text-center">
                  <input
                    ref={headerSelectRef}
                    type="checkbox"
                    checked={allRowsSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    className="rounded border-gray-300"
                    aria-label="현재 목록 전체 선택"
                  />
                </th>
                <th className="px-3 py-2 font-medium">주문 / id</th>
                <th className="px-3 py-2 font-medium">매장</th>
                <th className="px-3 py-2 font-medium">금액</th>
                <th className="px-3 py-2 font-medium">주문</th>
                <th className="px-3 py-2 font-medium">일시</th>
                <th className="px-3 py-2 font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={(e) => toggleSelect(r.id, e.target.checked)}
                      className="rounded border-gray-300"
                      aria-label={`주문 ${r.order_no} 선택`}
                    />
                  </td>
                  <td className="max-w-[200px] px-3 py-2 font-mono text-[12px] text-gray-800">
                    <div>{r.order_no}</div>
                    <div className="break-all text-[11px] font-normal text-gray-400" title={r.id}>
                      {r.id}
                    </div>
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-gray-800">
                    {r.store_name || r.store_id}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{formatMoneyPhp(r.payment_amount)}</td>
                  <td className="px-3 py-2">{ORDER_LABEL[r.order_status] ?? r.order_status}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                    {new Date(r.created_at).toLocaleString("ko-KR")}
                  </td>
                  <td className="space-y-1 px-3 py-2 align-top">
                    {r.order_status === "refund_requested" ? (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void approveRefund(r.id)}
                        className="block rounded-ui-rect border border-red-200 bg-red-50 px-2 py-1 text-[12px] font-medium text-red-800 disabled:opacity-50"
                      >
                        {busyId === r.id ? "…" : "환불 승인"}
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
