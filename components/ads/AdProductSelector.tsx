"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { postAdTypeLabel } from "@/lib/ads/post-ad-label-keys";
import type { AdProduct, AdPaymentMethod } from "@/lib/ads/types";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
  const { t, safeT } = useI18n();
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
              ? "이미 상단 고정이 진행 중입니다."
              : j.error === "ad_type_quarantined"
                ? "이 상품은 더 이상 신청할 수 없습니다."
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
    <DibayBottomSheet
      open
      onClose={onClose}
      title={safeT("community_top_fix_apply_title", {
        fallbackKo: "상단에 올리기",
        fallbackEn: "Pin to top",
      })}
      anchor="above-bottom-nav"
    >
        <p className={`mb-3 truncate ${OverlayUi.bodySecondary}`}>
          {t("ui_ad_post_label")} <span className="font-medium text-[color:var(--overlay-text-primary)]">{postTitle}</span>
        </p>

        {/* 포인트 잔액 */}
        <div className="mb-4 flex items-center justify-between rounded-[length:var(--overlay-radius-md)] bg-sky-50 px-3 py-2.5">
          <span className="text-sky-800">{t("ui_ad_my_points")}</span>
          <span className="font-bold text-sky-900">{userPointBalance.toLocaleString()}P</span>
        </div>

        {/* 상품 목록 */}
        {loading ? (
          <p className={`py-6 text-center ${OverlayUi.bodySecondary}`}>{t("common_loading")}</p>
        ) : products.length === 0 ? (
          <p className={`py-6 text-center ${OverlayUi.bodySecondary}`}>{t("ui_ad_no_board_products")}</p>
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
                  className={`w-full rounded-[length:var(--overlay-radius-md)] border px-3 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[color:var(--overlay-text-primary)]">{p.name}</p>
                      <p className={`mt-0.5 ${OverlayUi.caption}`}>
                        {postAdTypeLabel(t, p.adType)} · {t("philife_write_ad_duration_days", { days: p.durationDays })}
                      </p>
                      {p.description ? (
                        <p className={`mt-0.5 ${OverlayUi.caption}`}>{p.description}</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[color:var(--overlay-text-primary)]">{p.pointCost.toLocaleString()}P</p>
                      {lacking > 0 ? (
                        <p className={`${OverlayUi.caption} text-[color:var(--overlay-danger)]`}>{t("ui_ad_points_short", { amount: lacking.toLocaleString() })}</p>
                      ) : (
                        <p className={`${OverlayUi.caption} text-emerald-600`}>{t("ui_ad_points_available")}</p>
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
            <p className="mb-2 font-semibold text-[color:var(--overlay-text-primary)]">{t("philife_write_payment_method")}</p>
            <div className="flex gap-2">
              {(["points", "bank_transfer"] as AdPaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`flex-1 rounded-[length:var(--overlay-radius-md)] border py-2 font-medium ${
                    paymentMethod === m
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] text-[color:var(--overlay-text-primary)]"
                  }`}
                >
                  {m === "points" ? t("ui_ad_payment_points") : t("ui_ad_payment_bank")}
                </button>
              ))}
            </div>

            {/* 포인트 방식: 부족 시 안내 */}
            {paymentMethod === "points" && shortfall > 0 && (
              <div className="mt-2 rounded-[length:var(--overlay-radius-md)] bg-red-50 px-3 py-2.5 text-[color:var(--overlay-danger)]">
                <p className="font-semibold">{t("ui_ad_points_short_title", { amount: shortfall.toLocaleString() })}</p>
                <p className="mt-1">{t("ui_ad_points_short_hint")}</p>
              </div>
            )}

            {/* 입금 방식: 입금자명 */}
            {paymentMethod === "bank_transfer" && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={depositorName}
                  onChange={(e) => setDepositorName(e.target.value)}
                  placeholder={t("ui_ad_depositor_required_ph")}
                  className={OverlayUi.input}
                />
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={t("ui_ad_memo_optional_ph")}
                  className={OverlayUi.input}
                />
                <div className="rounded-[length:var(--overlay-radius-md)] bg-sky-50 px-3 py-2 text-sky-800">
                  <p className="font-semibold">{t("ui_ad_deposit_guide_title")}</p>
                  <p>{t("ui_ad_deposit_guide_body")}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {err ? <p className={`mb-3 ${OverlayUi.caption} text-[color:var(--overlay-danger)]`}>{err}</p> : null}

        <DibayOverlayButton
          roleTone="primary"
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit || submitting}
          loading={submitting}
          className="w-full"
        >
          {submitting
            ? t("community_meeting_join_processing")
            : paymentMethod === "bank_transfer"
              ? t("ui_ad_submit_bank")
              : t("ui_ad_submit_points")}
        </DibayOverlayButton>
    </DibayBottomSheet>
  );
}
