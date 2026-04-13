"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";

type TradePostAdRow = {
  id: string;
  post_id: string;
  user_id: string;
  apply_status: string;
  point_cost: number;
  priority: number;
  start_at: string | null;
  end_at: string | null;
  admin_memo: string | null;
  created_at: string;
};

export function AdminTradePostAdsPage() {
  const [rows, setRows] = useState<TradePostAdRow[]>([]);
  const [holds, setHolds] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/trade-post-ads", { cache: "no-store" }),
        fetch("/api/admin/trade-ad-point-holds", { cache: "no-store" }),
      ]);
      const j1 = (await r1.json()) as { ok?: boolean; rows?: TradePostAdRow[]; error?: string };
      const j2 = (await r2.json()) as { ok?: boolean; rows?: Record<string, unknown>[] };
      if (!r1.ok || !j1.ok) {
        setErr(j1.error ?? "목록 로드 실패");
        setRows([]);
      } else {
        setRows(j1.rows ?? []);
      }
      if (r2.ok && j2.ok) setHolds(j2.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activate = async (row: TradePostAdRow) => {
    const start = window.prompt("시작 시각 (ISO, 비우면 지금)", new Date().toISOString());
    if (start === null) return;
    const end = window.prompt("종료 시각 (ISO, 필수)", "");
    if (end === null || !end.trim()) {
      setErr("종료 시각이 필요합니다.");
      return;
    }
    setBusyId(row.id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/trade-post-ads/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apply_status: "active",
          start_at: start.trim() ? start.trim() : new Date().toISOString(),
          end_at: end.trim(),
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "처리 실패");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (row: TradePostAdRow) => {
    setBusyId(row.id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/trade-post-ads/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply_status: "rejected" }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "처리 실패");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="거래 상세 광고 (trade_post_ads)" />

      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          {err}
        </div>
      ) : null}

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-sam-fg">신청·상태</h2>
        {loading ? (
          <p className="text-[13px] text-sam-muted">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-sam-muted">등록된 행이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
            <table className="min-w-full text-left text-[13px]">
              <thead className="bg-sam-surface-muted text-sam-muted">
                <tr>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">포인트</th>
                  <th className="px-3 py-2">게시글</th>
                  <th className="px-3 py-2">기간</th>
                  <th className="px-3 py-2">동작</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-sam-border-soft">
                    <td className="px-3 py-2 font-medium">{r.apply_status}</td>
                    <td className="px-3 py-2">{r.point_cost}</td>
                    <td className="px-3 py-2">
                      <Link href={`/post/${r.post_id}`} className="text-blue-700 underline" target="_blank">
                        {r.post_id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="max-w-[200px] px-3 py-2 text-sam-muted">
                      {r.start_at && r.end_at ? (
                        <>
                          {r.start_at}
                          <br />~ {r.end_at}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.apply_status !== "active" && r.apply_status !== "rejected" ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void activate(r)}
                            className="mr-2 rounded-ui-rect bg-emerald-600 px-2 py-1 text-[12px] text-white disabled:opacity-50"
                          >
                            활성
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void reject(r)}
                            className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px] disabled:opacity-50"
                          >
                            반려
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-sam-fg">포인트 hold / 차감 기록</h2>
        {holds.length === 0 ? (
          <p className="text-[13px] text-sam-muted">기록 없음</p>
        ) : (
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
            <table className="min-w-full text-left text-[13px]">
              <thead className="bg-sam-surface-muted text-sam-muted">
                <tr>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">금액</th>
                  <th className="px-3 py-2">광고 ID</th>
                  <th className="px-3 py-2">시각</th>
                </tr>
              </thead>
              <tbody>
                {holds.map((h) => (
                  <tr key={String(h.id)} className="border-t border-sam-border-soft">
                    <td className="px-3 py-2">{String(h.status ?? "")}</td>
                    <td className="px-3 py-2">{String(h.amount ?? "")}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{String(h.trade_post_ad_id ?? "")}</td>
                    <td className="px-3 py-2 text-sam-muted">{String(h.created_at ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
