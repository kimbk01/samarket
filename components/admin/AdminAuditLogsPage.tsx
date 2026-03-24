"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type Row = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  target_type: string;
  target_id: string;
  action: string;
  before_json: unknown;
  after_json: unknown;
  ip: string | null;
  created_at: string;
};

function JsonBlock({ label, v }: { label: string; v: unknown }) {
  if (v == null) return null;
  const s = JSON.stringify(v, null, 2);
  if (s === "null" || s === "{}") return null;
  return (
    <details className="mt-1 text-left">
      <summary className="cursor-pointer text-[11px] text-gray-500">{label}</summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-[10px] text-gray-800">
        {s}
      </pre>
    </details>
  );
}

export function AdminAuditLogsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (filter.trim()) q.set("target_type", filter.trim());
      const res = await fetch(`/api/admin/audit-logs?${q.toString()}`, { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("관리자 권한이 없습니다.");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "audit_logs 테이블을 적용해 주세요." : json?.error);
        setRows([]);
        return;
      }
      setRows(json.logs ?? []);
    } catch {
      setError("network_error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="로그 감사" />
      <p className="text-[13px] text-gray-600">
        매장 커머스: 관리자 조작, 매장 오너 주문 상태 변경(user), 결제 웹훅(system) 등이 기록됩니다. IP는 프록시
        환경에 따라 다를 수 있습니다.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs text-gray-600">target_type 필터</span>
          <input
            className="mt-0.5 block rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            placeholder="예: store_order, cron_job"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white"
        >
          조회
        </button>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">로그가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono text-[11px] text-gray-500">{r.created_at}</span>
                <span className="text-xs text-gray-600">
                  {r.actor_type}
                  {r.actor_id ? ` · ${r.actor_id.slice(0, 8)}…` : ""}
                </span>
              </div>
              <p className="mt-1 font-medium text-gray-900">{r.action}</p>
              <p className="text-xs text-gray-600">
                {r.target_type} · <span className="font-mono">{r.target_id}</span>
                {r.ip ? ` · ${r.ip}` : ""}
              </p>
              <JsonBlock label="before" v={r.before_json} />
              <JsonBlock label="after" v={r.after_json} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
