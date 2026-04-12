"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatMoneyPhp } from "@/lib/utils/format";

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

export function AdminStoreSettlementsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [holdMemo, setHoldMemo] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store-settlements", { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("관리자 권한이 없습니다.");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "store_settlements 테이블을 적용해 주세요." : json?.error);
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

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/store-settlements/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json?.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title="매장 정산" />
      <p className="text-[13px] text-sam-muted">
        결제 완료 주문마다 예정 건이 생성됩니다. 지급 완료는 운영에서 처리합니다.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-sam-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted">정산 건이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-sam-border-soft bg-sam-app text-sam-muted">
              <tr>
                <th className="px-3 py-2">매장</th>
                <th className="px-3 py-2">주문</th>
                <th className="px-3 py-2">정산액</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">지급예정일</th>
                <th className="px-3 py-2">동작</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2 font-medium text-sam-fg">{r.store_name || r.store_id}</td>
                  <td className="px-3 py-2 text-sam-muted">{r.order_no || r.order_id.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{formatMoneyPhp(Number(r.settlement_amount) || 0)}</span>
                    <span className="ml-1 text-[11px] text-sam-meta">
                      (수수료 {formatMoneyPhp(Number(r.fee_amount) || 0)})
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sam-fg">{r.settlement_status}</td>
                  <td className="px-3 py-2 text-sam-muted">{r.settlement_due_date}</td>
                  <td className="px-3 py-2">
                    {r.settlement_status === "scheduled" ? (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          className="rounded bg-sam-ink px-2 py-1 text-[11px] text-white disabled:opacity-50"
                          onClick={() => void patch(r.id, { settlement_status: "paid" })}
                        >
                          지급완료
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          className="rounded border border-sam-border px-2 py-1 text-[11px] disabled:opacity-50"
                          onClick={() => void patch(r.id, { settlement_status: "processing" })}
                        >
                          처리중
                        </button>
                        <input
                          className="w-36 rounded border border-sam-border px-1 py-0.5 text-[11px]"
                          placeholder="보류 사유"
                          value={holdMemo[r.id] ?? ""}
                          onChange={(e) => setHoldMemo((m) => ({ ...m, [r.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          className="rounded border border-amber-300 px-2 py-1 text-[11px] text-amber-900 disabled:opacity-50"
                          onClick={() =>
                            void patch(r.id, {
                              settlement_status: "held",
                              hold_reason: holdMemo[r.id] ?? "",
                            })
                          }
                        >
                          보류
                        </button>
                      </div>
                    ) : r.settlement_status === "processing" ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        className="rounded bg-sam-ink px-2 py-1 text-[11px] text-white disabled:opacity-50"
                        onClick={() => void patch(r.id, { settlement_status: "paid" })}
                      >
                        지급완료
                      </button>
                    ) : (
                      <span className="text-[11px] text-sam-meta">—</span>
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
