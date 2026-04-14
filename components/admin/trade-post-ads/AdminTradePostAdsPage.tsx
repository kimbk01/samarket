"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import Link from "next/link";
import { TRADE_PAID_AD_FORMAT_GUIDE } from "@/lib/trade-ads/trade-post-ad-policy";

type TradePostAdRow = {
  id: string;
  post_id: string;
  user_id: string;
  ad_product_id?: string | null;
  apply_status: string;
  point_cost: number;
  priority: number;
  start_at: string | null;
  end_at: string | null;
  admin_memo: string | null;
  created_at: string;
  post?: {
    id?: string;
    title?: string;
    status?: string;
    category_id?: string;
    region?: string;
    city?: string;
    author_nickname?: string;
  } | null;
  product?: {
    id?: string;
    name?: string;
    placement?: string;
    duration_days?: number;
    point_cost?: number;
    service_type?: string | null;
    region_target?: string | null;
    category_id?: string | null;
  } | null;
};

const PLACEMENT_LABEL: Record<string, string> = {
  detail_bottom: "상세 하단",
  list_top: "목록 상단",
  home_featured: "홈 추천",
  premium_all: "프리미엄",
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

  const runAction = async (
    row: TradePostAdRow,
    action: "verify" | "activate" | "reject" | "end",
    extra?: { start_at?: string; end_at?: string; admin_memo?: string }
  ) => {
    setBusyId(row.id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/trade-post-ads/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(extra ?? {}) }),
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

  const activateWithManualPeriod = async (row: TradePostAdRow) => {
    const start = window.prompt("시작 시각 (ISO, 비우면 지금)", new Date().toISOString());
    if (start === null) return;
    const end = window.prompt("종료 시각 (ISO, 필수)", "");
    if (end === null || !end.trim()) {
      setErr("종료 시각이 필요합니다.");
      return;
    }
    await runAction(row, "activate", {
      start_at: start.trim() ? start.trim() : new Date().toISOString(),
      end_at: end.trim(),
    });
  };

  const stageRows = useMemo(() => {
    const by = {
      sellerApplied: [] as TradePostAdRow[],
      adminVerified: [] as TradePostAdRow[],
      adminActive: [] as TradePostAdRow[],
      closed: [] as TradePostAdRow[],
    };
    for (const row of rows) {
      const status = row.apply_status;
      if (status === "pending") by.sellerApplied.push(row);
      else if (status === "approved") by.adminVerified.push(row);
      else if (status === "active") by.adminActive.push(row);
      else by.closed.push(row);
    }
    return by;
  }, [rows]);

  const renderRows = (
    list: TradePostAdRow[],
    actions: (r: TradePostAdRow) => ReactNode,
    emptyText: string
  ) => {
    if (list.length === 0) return <p className="text-[13px] text-sam-muted">{emptyText}</p>;
    return (
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
        <table className="min-w-full text-left text-[13px]">
          <thead className="bg-sam-surface-muted text-sam-muted">
            <tr>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">상품</th>
              <th className="px-3 py-2">포인트</th>
              <th className="px-3 py-2">게시글</th>
              <th className="px-3 py-2">기간</th>
              <th className="px-3 py-2">동작</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-sam-border-soft">
                <td className="px-3 py-2 font-medium">{r.apply_status}</td>
                <td className="max-w-[180px] px-3 py-2 text-[12px]">
                  <p className="font-medium text-sam-fg">{r.product?.name ?? "상품 미연결"}</p>
                  <p className="text-sam-muted">
                    {(r.product?.placement && PLACEMENT_LABEL[r.product.placement]) || r.product?.placement || "slot-unknown"} ·{" "}
                    {Math.max(1, Math.floor(Number(r.product?.duration_days ?? 0) || 0)) || "?"}일
                  </p>
                </td>
                <td className="px-3 py-2">{r.point_cost}</td>
                <td className="px-3 py-2">
                  <Link href={`/post/${r.post_id}`} className="text-blue-700 underline" target="_blank">
                    {(r.post?.title && r.post.title.slice(0, 20)) || `${r.post_id.slice(0, 8)}…`}
                  </Link>
                  <p className="text-[11px] text-sam-muted">
                    {r.post?.author_nickname ?? "작성자"} · {r.post?.status ?? "status?"}
                  </p>
                </td>
                <td className="max-w-[220px] px-3 py-2 text-sam-muted">
                  {r.start_at && r.end_at ? (
                    <>
                      {r.start_at}
                      <br />~ {r.end_at}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{actions(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="거래 상세 광고 (trade_post_ads)"
        description="당근형 유료 광고 운영 흐름(신청→검토→기간 활성)을 여기서 처리합니다. 상품·단가 정책은 「거래 광고 정책」에서 수정하세요."
      />

      <p className="text-[13px] text-sam-muted">
        <Link href="/admin/trade-ad-policies" className="text-blue-700 underline">
          거래 광고 정책 (ad_products)
        </Link>
      </p>
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="mb-2 text-[14px] font-semibold text-sam-fg">유료 광고 형식 기준</h2>
        <ul className="list-disc space-y-1 pl-5 text-[12px] text-sam-muted">
          {TRADE_PAID_AD_FORMAT_GUIDE.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          {err}
        </div>
      ) : null}

      {loading ? <p className="text-[13px] text-sam-muted">불러오는 중…</p> : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "판매자 신청", value: stageRows.sellerApplied.length },
          { label: "관리자 확인", value: stageRows.adminVerified.length },
          { label: "노출중", value: stageRows.adminActive.length },
          { label: "종료/반려", value: stageRows.closed.length },
        ].map((card) => (
          <div key={card.label} className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-center">
            <p className="text-[22px] font-bold text-sam-fg">{card.value}</p>
            <p className="text-[12px] text-sam-muted">{card.label}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-sam-fg">1) 판매자 신청 접수</h2>
        <p className="mb-2 text-[12px] text-sam-muted">
          판매자가 신청한 건을 확인하고, 기준 충족 시 `확인완료`로 전환합니다.
        </p>
        {renderRows(
          stageRows.sellerApplied,
          (r) => (
            <>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void runAction(r, "verify")}
                className="mr-2 rounded-ui-rect bg-blue-600 px-2 py-1 text-[12px] text-white disabled:opacity-50"
              >
                확인완료
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void runAction(r, "reject")}
                className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px] disabled:opacity-50"
              >
                반려
              </button>
            </>
          ),
          "신청 접수 건이 없습니다."
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-sam-fg">2) 관리자 심사/집행</h2>
        <p className="mb-2 text-[12px] text-sam-muted">
          확인 완료된 건만 광고 집행(활성)할 수 있습니다. 기본은 상품 기간 자동 적용입니다.
        </p>
        {renderRows(
          stageRows.adminVerified,
          (r) => (
            <>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void runAction(r, "activate")}
                className="mr-2 rounded-ui-rect bg-emerald-600 px-2 py-1 text-[12px] text-white disabled:opacity-50"
              >
                활성(자동기간)
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void activateWithManualPeriod(r)}
                className="mr-2 rounded-ui-rect border border-sam-border px-2 py-1 text-[12px] disabled:opacity-50"
              >
                활성(기간수동)
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void runAction(r, "reject")}
                className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px] disabled:opacity-50"
              >
                반려
              </button>
            </>
          ),
          "심사 대기(확인완료) 건이 없습니다."
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-sam-fg">3) 노출 운영/종료</h2>
        <p className="mb-2 text-[12px] text-sam-muted">
          노출중 광고를 조기 종료할 수 있습니다.
        </p>
        {renderRows(
          stageRows.adminActive,
          (r) => (
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => void runAction(r, "end")}
              className="rounded-ui-rect border border-sam-border px-2 py-1 text-[12px] disabled:opacity-50"
            >
              종료
            </button>
          ),
          "현재 노출중인 광고가 없습니다."
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-sam-fg">4) 완료/반려 이력</h2>
        <p className="mb-2 text-[12px] text-sam-muted">
          종료·반려·취소 상태를 확인하는 이력 영역입니다.
        </p>
        {renderRows(stageRows.closed, () => <span className="text-[12px] text-sam-muted">이력</span>, "이력이 없습니다.")}
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
