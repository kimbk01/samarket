"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type Row = {
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
  action_type: string | null;
  action_memo: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export function AdminStoreReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [memoById, setMemoById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store-reports", { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("관리자 권한이 없습니다.");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "store_reports 테이블을 적용해 주세요." : json?.error);
        setRows([]);
        return;
      }
      setRows(json.reports ?? []);
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

  async function patchStatus(id: string, status: "dismissed" | "actioned") {
    setBusyId(id);
    try {
      const memo = (memoById[id] ?? "").trim();
      const res = await fetch(`/api/admin/store-reports/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          action_memo: memo || null,
          action_type: status === "dismissed" ? "dismiss" : "action",
        }),
      });
      const json = await res.json();
      if (json?.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title="매장·상품 신고" />
      <p className="text-[13px] text-sam-muted">
        열린 건만 기각·조치할 수 있습니다. 메모는 내부 기록용입니다.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">신고가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-sam-fg">
                  {r.store_name || r.store_id}
                  {r.target_type === "product" && r.product_title ? (
                    <span className="block text-xs font-normal text-sam-muted">
                      상품: {r.product_title}
                    </span>
                  ) : null}
                </span>
                <span
                  className={
                    r.status === "open"
                      ? "text-xs text-amber-700"
                      : r.status === "actioned"
                        ? "text-xs text-green-700"
                        : "text-xs text-sam-muted"
                  }
                >
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-sam-muted">
                대상 {r.target_type} · {r.target_id} · 신고자 {r.reporter_user_id}
              </p>
              <p className="mt-1 text-xs text-sam-muted">사유: {r.reason_type}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-sam-fg">{r.message}</p>
              {r.status !== "open" ? (
                <p className="mt-2 text-xs text-sam-muted">
                  검토: {r.reviewed_at ?? "-"} · {r.action_memo ?? r.action_type ?? ""}
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    className="w-full rounded-ui-rect border border-sam-border px-2 py-1.5 text-xs"
                    placeholder="처리 메모 (선택)"
                    value={memoById[r.id] ?? ""}
                    onChange={(e) => setMemoById((m) => ({ ...m, [r.id]: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs font-medium text-sam-fg disabled:opacity-50"
                      onClick={() => void patchStatus(r.id, "dismissed")}
                    >
                      기각
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      className="rounded-ui-rect bg-sam-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      onClick={() => void patchStatus(r.id, "actioned")}
                    >
                      조치 완료
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
