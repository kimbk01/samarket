"use client";

import { useEffect, useMemo, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type TradeAdProductItem = {
  id: string;
  name: string;
  description: string | null;
  placement: string | null;
  ad_type: string;
  duration_days: number;
  point_cost: number;
  eligible: boolean;
  reason: string | null;
  checks?: Array<{ key: string; pass: boolean; label: string; detail: string }>;
};

type TradeAdProductsResponse = {
  ok?: boolean;
  error?: string;
  formatGuide?: string[];
  criteriaSummary?: string;
  products?: TradeAdProductItem[];
  existingCount?: number;
};

const PLACEMENT_LABEL: Record<string, string> = {
  detail_bottom: "상세 하단",
  list_top: "목록 상단",
  home_featured: "홈 추천",
  premium_all: "프리미엄",
};

export function TradePostAdApplySheet({
  postId,
  open,
  onClose,
}: {
  postId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [message, setMessage] = useState("");
  const [data, setData] = useState<TradeAdProductsResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading((prev) => (prev ? prev : true));
    setErr((prev) => (prev === "" ? prev : ""));
    setMessage((prev) => (prev === "" ? prev : ""));
    runSingleFlight(`trade:post-ad-products:${postId}`, () =>
      fetch(`/api/posts/${encodeURIComponent(postId)}/trade-ads/products`, { cache: "no-store" })
    )
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as TradeAdProductsResponse;
        if (cancelled) return;
        if (!res.ok || !j.ok) {
          setData(null);
          setErr(j.error ?? "광고 상품을 불러오지 못했습니다.");
          return;
        }
        setData(j);
      })
      .catch(() => {
        if (!cancelled) setErr("네트워크 오류로 광고 상품을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading((prev) => (prev ? false : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [open, postId]);

  const products = useMemo(() => data?.products ?? [], [data]);

  const apply = async (adProductId: string) => {
    if (submittingId) return;
    setSubmittingId(adProductId);
    setErr((prev) => (prev === "" ? prev : ""));
    setMessage((prev) => (prev === "" ? prev : ""));
    try {
      const res = await runSingleFlight(`trade:post-ad-apply:${postId}:${adProductId}`, () =>
        fetch(`/api/posts/${encodeURIComponent(postId)}/trade-ads/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ad_product_id: adProductId }),
        })
      );
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "광고 신청에 실패했습니다.");
        return;
      }
      setMessage("광고 신청이 접수되었습니다. 관리자 승인 후 노출됩니다.");
    } finally {
      setSubmittingId((prev) => (prev === null ? prev : null));
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface px-4 pb-6 pt-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="sam-text-body-lg font-semibold text-sam-fg">유료 광고 신청</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-sam-border px-2 py-1 sam-text-helper text-sam-muted"
          >
            닫기
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center sam-text-body-secondary text-sam-muted">불러오는 중…</p>
        ) : (
          <>
            {err ? (
              <p className="mb-3 rounded-ui-rect bg-red-50 px-3 py-2 sam-text-helper text-red-700">{err}</p>
            ) : null}
            {message ? (
              <p className="mb-3 rounded-ui-rect bg-emerald-50 px-3 py-2 sam-text-helper text-emerald-700">{message}</p>
            ) : null}
            {data?.criteriaSummary ? (
              <p className="mb-3 rounded-ui-rect bg-sam-app px-3 py-2 sam-text-helper text-sam-muted">{data.criteriaSummary}</p>
            ) : null}
            {Array.isArray(data?.formatGuide) && data?.formatGuide.length > 0 ? (
              <ul className="mb-3 list-disc space-y-1 pl-5 sam-text-helper text-sam-muted">
                {data.formatGuide.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {products.length === 0 ? (
              <p className="py-8 text-center sam-text-body-secondary text-sam-muted">신청 가능한 광고 상품이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {products.map((p) => {
                  const disabled = !p.eligible || submittingId != null;
                  return (
                    <div key={p.id} className="rounded-ui-rect border border-sam-border px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="sam-text-body font-semibold text-sam-fg">{p.name}</p>
                          <p className="mt-0.5 sam-text-helper text-sam-muted">
                            {(p.placement && PLACEMENT_LABEL[p.placement]) || p.placement || "거래 광고"} ·{" "}
                            {p.duration_days}일
                          </p>
                          {p.description ? (
                            <p className="mt-0.5 sam-text-helper text-sam-meta">{p.description}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="sam-text-body font-bold text-sam-fg">{p.point_cost.toLocaleString()}P</p>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => void apply(p.id)}
                            className="mt-2 rounded-ui-rect bg-sam-ink px-3 py-1.5 sam-text-helper font-semibold text-white disabled:opacity-40"
                          >
                            {submittingId === p.id ? "처리 중…" : "신청"}
                          </button>
                        </div>
                      </div>
                      {!p.eligible && p.reason ? (
                        <p className="mt-2 rounded-ui-rect bg-amber-50 px-2 py-1 sam-text-xxs text-amber-800">
                          신청 불가: {p.reason}
                        </p>
                      ) : null}
                      {Array.isArray(p.checks) && p.checks.length > 0 ? (
                        <div className="mt-2 rounded-ui-rect bg-sam-app px-2 py-2 sam-text-xxs">
                          <p className="mb-1 font-semibold text-sam-fg">신청 체크리스트</p>
                          <ul className="space-y-1 text-sam-muted">
                            {p.checks.map((c) => (
                              <li key={c.key} className={c.pass ? "text-emerald-700" : "text-red-700"}>
                                {c.pass ? "통과" : "미통과"} · {c.label} — {c.detail}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
