"use client";

import { useEffect, useState } from "react";
import type { AdProduct, AdPaymentMethod } from "@/lib/ads/types";
import { AD_TYPE_LABELS } from "@/lib/ads/types";

interface AdProductSelectorProps {
  boardKey?: string;
  postId: string;
  postTitle: string;
  userPointBalance: number;
  onClose: () => void;
  onSuccess: (adId: string) => void;
}

export function AdProductSelector({
  boardKey = "plife",
  postId,
  postTitle,
  userPointBalance,
  onClose,
  onSuccess,
}: AdProductSelectorProps) {
  const [products, setProducts] = useState<AdProduct[]>([]);
  const [selected, setSelected] = useState<AdProduct | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<AdPaymentMethod>("points");
  const [depositorName, setDepositorName] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch(`/api/ads/products?boardKey=${boardKey}`)
      .then((r) => r.json())
      .then((j: { products?: AdProduct[] }) => {
        setProducts(j.products ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [boardKey]);

  const shortfall =
    selected && paymentMethod === "points" ? Math.max(0, selected.pointCost - userPointBalance) : 0;

  const canSubmit =
    selected !== null &&
    (paymentMethod === "points"
      ? shortfall === 0
      : depositorName.trim().length > 0);

  const submit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch("/api/ads/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          adProductId: selected.id,
          paymentMethod,
          depositorName: paymentMethod === "bank_transfer" ? depositorName : undefined,
          memo: memo || undefined,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; adId?: string; pointShortfall?: number };
      if (!res.ok || !j.ok) {
        setErr(
          j.error === "insufficient_points"
            ? `포인트가 ${j.pointShortfall?.toLocaleString() ?? ""}P 부족합니다.`
            : j.error === "already_has_active_ad"
              ? "이미 진행 중인 광고가 있습니다."
              : j.error ?? "신청 실패"
        );
        return;
      }
      onSuccess(j.adId ?? "");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    /* 모달 오버레이 */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-[length:var(--ui-radius-rect)] bg-sam-surface px-5 pb-10 pt-5 shadow-2xl">
        {/* 헤더 */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="sam-text-section-title font-bold text-sam-fg">광고 신청</h2>
          <button
            type="button"
            onClick={onClose}
            className="sam-text-body-secondary text-sam-muted hover:text-sam-fg"
          >
            닫기
          </button>
        </div>

        <p className="mb-3 truncate sam-text-body-secondary text-sam-muted">
          게시글: <span className="font-medium text-sam-fg">{postTitle}</span>
        </p>

        {/* 포인트 잔액 */}
        <div className="mb-4 flex items-center justify-between rounded-ui-rect bg-sky-50 px-3 py-2.5 sam-text-body-secondary">
          <span className="text-sky-800">내 포인트</span>
          <span className="font-bold text-sky-900">{userPointBalance.toLocaleString()}P</span>
        </div>

        {/* 상품 목록 */}
        {loading ? (
          <p className="py-6 text-center sam-text-body-secondary text-sam-muted">불러오는 중…</p>
        ) : products.length === 0 ? (
          <p className="py-6 text-center sam-text-body-secondary text-sam-muted">이 게시판에 등록된 광고 상품이 없습니다.</p>
        ) : (
          <div className="mb-4 space-y-2">
            {products.map((p) => {
              const isSelected = selected?.id === p.id;
              const lacking = Math.max(0, p.pointCost - userPointBalance);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  className={`w-full rounded-ui-rect border px-3 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-sam-border bg-sam-surface hover:bg-sam-app"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="sam-text-body font-semibold text-sam-fg">{p.name}</p>
                      <p className="mt-0.5 sam-text-helper text-sam-muted">
                        {AD_TYPE_LABELS[p.adType]} · {p.durationDays}일
                      </p>
                      {p.description ? (
                        <p className="mt-0.5 sam-text-helper text-sam-muted">{p.description}</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="sam-text-body font-bold text-sam-fg">{p.pointCost.toLocaleString()}P</p>
                      {lacking > 0 ? (
                        <p className="sam-text-xxs text-red-500">{lacking.toLocaleString()}P 부족</p>
                      ) : (
                        <p className="sam-text-xxs text-emerald-600">사용 가능</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* 결제 방법 선택 (포인트 vs 입금) */}
        {selected !== null && (
          <div className="mb-4">
            <p className="mb-2 sam-text-body-secondary font-semibold text-sam-fg">결제 방식</p>
            <div className="flex gap-2">
              {(["points", "bank_transfer"] as AdPaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`flex-1 rounded-ui-rect border py-2 sam-text-body-secondary font-medium ${
                    paymentMethod === m
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-sam-border bg-sam-surface text-sam-fg"
                  }`}
                >
                  {m === "points" ? "포인트 사용" : "계좌 입금"}
                </button>
              ))}
            </div>

            {/* 포인트 방식: 부족 시 안내 */}
            {paymentMethod === "points" && shortfall > 0 && (
              <div className="mt-2 rounded-ui-rect bg-red-50 px-3 py-2.5 sam-text-helper text-red-700">
                <p className="font-semibold">포인트 부족 {shortfall.toLocaleString()}P</p>
                <p className="mt-1">
                  포인트를 충전하거나 계좌 입금 방식을 선택해 주세요.
                </p>
              </div>
            )}

            {/* 입금 방식: 입금자명 */}
            {paymentMethod === "bank_transfer" && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={depositorName}
                  onChange={(e) => setDepositorName(e.target.value)}
                  placeholder="입금자명 (필수)"
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body outline-none focus:border-sky-300"
                />
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="메모 (선택)"
                  className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body outline-none focus:border-sky-300"
                />
                <div className="rounded-ui-rect bg-sky-50 px-3 py-2 sam-text-helper text-sky-800">
                  <p className="font-semibold">입금 안내</p>
                  <p>관리자 확인 후 광고가 승인됩니다.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {err ? <p className="mb-3 sam-text-helper text-red-600">{err}</p> : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit || submitting}
          className="w-full rounded-ui-rect bg-emerald-600 py-3.5 sam-text-body font-bold text-white shadow-md disabled:opacity-40"
        >
          {submitting ? "처리 중…" : paymentMethod === "bank_transfer" ? "입금 신청하기" : "광고 신청하기"}
        </button>
      </div>
    </div>
  );
}
