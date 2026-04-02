"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAppSettings } from "@/lib/admin-settings/mock-app-settings";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { formatPrice } from "@/lib/utils/format";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  order_id: string;
  order_no: string;
  gross_amount: number;
  fee_amount: number;
  settlement_amount: number;
  settlement_status: string;
  settlement_due_date: string;
  paid_at: string | null;
  hold_reason: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "지급 예정",
  processing: "처리 중",
  paid: "지급 완료",
  held: "보류",
  cancelled: "취소",
};

export function MyStoreSettlementsPage() {
  const searchParams = useSearchParams();
  const storeIdFilter = searchParams.get("storeId")?.trim() || null;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currency = useMemo(() => getAppSettings().defaultCurrency ?? "KRW", []);
  const displayRows = useMemo(() => {
    if (!storeIdFilter) return rows;
    return rows.filter((r) => r.store_id === storeIdFilter);
  }, [rows, storeIdFilter]);

  const fmt = useCallback((n: number) => formatPrice(n, currency), [currency]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/store-settlements", { credentials: "include" });
      const json = await res.json();
      if (res.status === 401) {
        setError("로그인이 필요합니다.");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "정산 테이블이 아직 적용되지 않았습니다." : json?.error);
        setRows([]);
        return;
      }
      setRows(json.settlements ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="pb-8">
      <div className={`${OWNER_STORE_STACK_Y_CLASS}`}>
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm text-gray-500">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
            아직 정산 내역이 없습니다. 주문이 결제 완료되면 예정 건이 표시됩니다.
          </p>
        ) : displayRows.length === 0 ? (
          <p className="rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
            선택한 매장에 해당하는 정산 건이 없습니다. 운영 허브에서 다른 매장을 선택했는지 확인해 주세요.
          </p>
        ) : (
          <ul className="space-y-2">
            {storeIdFilter ? (
              <li className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
                이 매장 정산만 표시 중입니다.{" "}
                <Link href="/my/business/settlements" className="font-medium text-signature underline">
                  전체 매장 보기
                </Link>
              </li>
            ) : null}
            {displayRows.map((r) => (
              <li key={r.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">{r.store_name}</span>
                  <span className="text-xs text-gray-500">
                    {STATUS_LABEL[r.settlement_status] ?? r.settlement_status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  주문 {r.order_no || r.order_id.slice(0, 8)} · 예정일 {r.settlement_due_date}
                </p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {fmt(Number(r.settlement_amount) || 0)}
                </p>
                <p className="text-[11px] text-gray-400">
                  매출 {fmt(Number(r.gross_amount) || 0)} · 수수료 {fmt(Number(r.fee_amount) || 0)}
                </p>
                {r.hold_reason ? (
                  <p className="mt-2 text-xs text-amber-800">보류 사유: {r.hold_reason}</p>
                ) : null}
                {r.paid_at ? (
                  <p className="mt-1 text-xs text-green-700">지급일 {r.paid_at.slice(0, 10)}</p>
                ) : null}
                <Link
                  href={buildStoreOrdersHref({ storeId: r.store_id })}
                  className="mt-2 inline-block text-xs text-signature"
                >
                  주문 관리로
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
