"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";

type Row = Record<string, unknown>;

export function AdminTradeAdPoliciesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/trade-ad-products", { cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; rows?: Row[]; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "목록 로드 실패");
        setRows([]);
      } else {
        setRows(j.rows ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (r: Row) => {
    const id = String(r.id ?? "");
    if (!id) return;
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/trade-ad-products/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !r.is_active }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "저장 실패");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="거래 광고 정책 (ad_products)"
        description="상세 하단·리스트 상단 등 거래 마켓 광고의 기간·포인트·노출 위치·서비스 타입을 DB에서 관리합니다. 수치는 코드가 아니라 여기서만 조정하세요."
      />

      <p className="sam-text-body-secondary text-sam-muted">
        신청 처리·승인은{" "}
        <Link href="/admin/trade-post-ads" className="text-blue-700 underline">
          거래 상세 광고 (trade_post_ads)
        </Link>{" "}
        메뉴에서 합니다.
      </p>

      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-3 sam-text-body-secondary text-red-800">{err}</div>
      ) : null}

      {loading ? (
        <p className="sam-text-body-secondary text-sam-muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="sam-text-body-secondary text-sam-muted">
          ad_products 테이블에 board_key=trade 또는 placement가 설정된 행이 없습니다. Supabase에 행을 추가하거나 마이그레이션 시드를 적용하세요.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-left sam-text-body-secondary">
            <thead className="bg-sam-surface-muted text-sam-muted">
              <tr>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">board</th>
                <th className="px-3 py-2">placement</th>
                <th className="px-3 py-2">서비스</th>
                <th className="px-3 py-2">기간(일)</th>
                <th className="px-3 py-2">포인트</th>
                <th className="px-3 py-2">순위</th>
                <th className="px-3 py-2">활성</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = String(r.id ?? "");
                return (
                  <tr key={id} className="border-t border-sam-border-soft">
                    <td className="px-3 py-2 font-medium text-sam-fg">{String(r.name ?? "")}</td>
                    <td className="px-3 py-2">{String(r.board_key ?? "—")}</td>
                    <td className="px-3 py-2">{String(r.placement ?? "—")}</td>
                    <td className="px-3 py-2">{String(r.service_type ?? "전체")}</td>
                    <td className="px-3 py-2">{String(r.duration_days ?? "")}</td>
                    <td className="px-3 py-2">{String(r.point_cost ?? "")}</td>
                    <td className="px-3 py-2">{String(r.priority_default ?? "")}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={busyId === id}
                        onClick={() => void toggleActive(r)}
                        className="rounded border border-sam-border px-2 py-0.5 sam-text-helper disabled:opacity-50"
                      >
                        {r.is_active ? "끄기" : "켜기"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
