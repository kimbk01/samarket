"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";

type StoreReportRow = {
  id: string;
  reporter_user_id: string;
  target_type: string;
  target_id: string;
  store_id: string;
  store_name: string;
  product_title: string | null;
  reason_type: string;
  message: string;
  status: string;
  created_at: string;
};

export function DeliveryReportsClient() {
  const [rows, setRows] = useState<StoreReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store-reports", { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean; error?: string; reports?: StoreReportRow[] };
      if (res.status === 403) {
        setError("forbidden");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "store_reports 테이블을 확인하세요." : json?.error ?? "load_failed");
        setRows([]);
        return;
      }
      setRows(Array.isArray(json.reports) ? json.reports : []);
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
    <div className="p-4 md:p-6">
      <AdminPageHeader title="신고·분쟁" backHref="/admin/delivery-orders" />
      <p className="mb-3 text-[13px] leading-relaxed text-sam-muted">
        <code className="rounded bg-sam-app px-1 text-[12px]">store_reports</code> 실데이터입니다. 상태 변경·메모·기각은{" "}
        <Link href="/admin/store-reports" className="font-medium text-signature underline">
          매장·상품 신고
        </Link>{" "}
        콘솔에서 처리하세요.
      </p>
      {error ? (
        <p className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
          불러오지 못했습니다 ({error}).
        </p>
      ) : null}
      <div className="mb-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs text-sam-fg disabled:opacity-50"
        >
          {loading ? "갱신 중…" : "새로고침"}
        </button>
      </div>
      <AdminCard title="신고 목록">
        {loading ? (
          <p className="text-sm text-sam-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-sam-muted">신고가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
            <table className="w-full min-w-[900px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
                  <th className="px-2 py-2">신고 ID</th>
                  <th className="px-2 py-2">매장</th>
                  <th className="px-2 py-2">대상</th>
                  <th className="px-2 py-2">사유</th>
                  <th className="px-2 py-2">상태</th>
                  <th className="px-2 py-2">접수</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border-soft">
                    <td className="px-2 py-2 font-mono text-[12px]">{r.id}</td>
                    <td className="max-w-[160px] truncate px-2 py-2">{r.store_name || r.store_id}</td>
                    <td className="px-2 py-2 text-xs">
                      {r.target_type}
                      <span className="text-sam-meta"> · </span>
                      <span className="font-mono">{r.target_id}</span>
                      {r.product_title ? (
                        <span className="mt-0.5 block text-sam-muted">상품: {r.product_title}</span>
                      ) : null}
                    </td>
                    <td className="max-w-[280px] px-2 py-2">
                      <span className="text-xs text-sam-muted">{r.reason_type}</span>
                      <p className="mt-0.5 line-clamp-2 text-sam-fg">{r.message}</p>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{r.status}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-sam-muted">
                      {new Date(r.created_at).toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
