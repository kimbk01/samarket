"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type Row = {
  id: string;
  store_id: string;
  store_name: string;
  order_id: string;
  buyer_user_id: string;
  rating: number;
  content: string;
  status: string;
  created_at: string;
  owner_reply_content?: string | null;
  owner_reply_created_at?: string | null;
};

export function AdminStoreReviewsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store-reviews", { credentials: "include" });
      const json = await res.json();
      if (res.status === 403) {
        setError("관리자 권한이 없습니다.");
        setRows([]);
        return;
      }
      if (!json?.ok) {
        setError(json?.error === "table_missing" ? "store_reviews 테이블을 적용해 주세요." : json?.error);
        setRows([]);
        return;
      }
      setRows(json.reviews ?? []);
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

  async function setStatus(id: string, status: "visible" | "hidden") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/store-reviews/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json?.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader title="매장 리뷰 검수" />
      <p className="text-[13px] text-gray-600">노출 숨김 처리만 지원합니다. 삭제는 DB 정책에 따릅니다.</p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">리뷰가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium text-gray-900">{r.store_name || r.store_id}</span>
                <span
                  className={
                    r.status === "visible" ? "text-xs text-green-700" : "text-xs text-gray-500"
                  }
                >
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                주문 {r.order_id} · 구매자 {r.buyer_user_id}
              </p>
              <p className="mt-2 text-amber-800">{"★".repeat(r.rating)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{r.content}</p>
              {r.owner_reply_content?.trim() ? (
                <div className="mt-2 rounded-ui-rect border border-gray-200 bg-gray-50 p-2">
                  <p className="text-[12px] font-semibold text-gray-700">사장님 댓글</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-gray-800">
                    {r.owner_reply_content}
                  </p>
                  {r.owner_reply_created_at ? (
                    <p className="mt-1 text-right text-[11px] text-gray-500">
                      {new Date(r.owner_reply_created_at).toLocaleDateString("ko-KR")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-gray-400">사장님 댓글 없음</p>
              )}
              <div className="mt-3 flex gap-2">
                {r.status === "visible" ? (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void setStatus(r.id, "hidden")}
                    className="rounded-ui-rect border border-gray-300 px-3 py-1.5 text-xs"
                  >
                    숨김
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void setStatus(r.id, "visible")}
                    className="rounded-ui-rect bg-signature px-3 py-1.5 text-xs text-white"
                  >
                    다시 노출
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
