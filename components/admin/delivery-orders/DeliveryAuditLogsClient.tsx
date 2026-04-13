"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";

type AuditRow = {
  id: string;
  actor_type: string;
  actor_id: string;
  target_type: string;
  target_id: string;
  action: string;
  before_json: unknown;
  after_json: unknown;
  created_at: string;
};

function jsonBrief(x: unknown): string {
  if (x == null) return "—";
  try {
    const s = JSON.stringify(x);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "—";
  }
}

export function DeliveryAuditLogsClient() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/audit-logs?target_type=store_order&limit=200", {
        credentials: "include",
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; logs?: AuditRow[] };
      if (res.status === 403) {
        setError("forbidden");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "audit_logs 테이블을 확인하세요." : json?.error ?? "load_failed");
        setRows([]);
        return;
      }
      setRows(Array.isArray(json.logs) ? json.logs : []);
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
      <AdminPageHeader title="주문 감사 로그" backHref="/admin/delivery-orders" />
      <p className="mb-3 text-[13px] text-sam-muted">
        <code className="rounded bg-sam-app px-1 text-[12px]">target_type = store_order</code> 감사 기록입니다. 전체
        감사는{" "}
        <Link href="/admin/audit-logs" className="text-signature underline">
          감사 로그
        </Link>
        메뉴를 이용하세요.
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
      <AdminCard title="주문 상태 변경 감사 (최대 200건)">
        {loading ? (
          <p className="text-sm text-sam-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-sam-muted">기록이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
            <table className="w-full min-w-[960px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-sam-border bg-sam-app text-left text-xs font-medium text-sam-muted">
                  <th className="px-2 py-2">시각</th>
                  <th className="px-2 py-2">주문</th>
                  <th className="px-2 py-2">행위자</th>
                  <th className="px-2 py-2">액션</th>
                  <th className="px-2 py-2">before</th>
                  <th className="px-2 py-2">after</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app/60">
                    <td className="whitespace-nowrap px-2 py-2 text-sam-muted">
                      {new Date(r.created_at).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/admin/delivery-orders/${encodeURIComponent(r.target_id)}`}
                        className="font-mono text-signature underline"
                      >
                        {r.target_id}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      {r.actor_type}
                      <span className="text-sam-meta"> · </span>
                      <span className="font-mono text-[11px]">{r.actor_id}</span>
                    </td>
                    <td className="px-2 py-2 font-medium">{r.action}</td>
                    <td className="max-w-[220px] truncate px-2 py-2 text-sam-muted" title={jsonBrief(r.before_json)}>
                      {jsonBrief(r.before_json)}
                    </td>
                    <td className="max-w-[220px] truncate px-2 py-2 text-sam-muted" title={jsonBrief(r.after_json)}>
                      {jsonBrief(r.after_json)}
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
