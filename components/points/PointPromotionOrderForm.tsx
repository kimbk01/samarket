"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import { formatMypageNumber } from "@/lib/mypage/format-mypage-date";
import type { MemberPromotionProductId } from "@/lib/points/promotion-products";

export interface PointPromotionOrderFormValues {
  targetType: "product";
  targetId: string;
  targetTitle: string;
  productId: MemberPromotionProductId;
  idempotencyKey?: string;
  /** 화면에 보였던 금액·기간 — 서버 가격과 다르면 결제 없이 409 price_changed */
  expectedPointCost: number;
  expectedDurationDays: number;
}

/** 거래 상위노출 카탈로그 — 가격·기간·사용 여부는 서버(DB 가격표) 값 */
type CatalogItem = {
  id: MemberPromotionProductId;
  pointCost: number;
  durationDays: number;
  fallbackTitleKo: string;
  fallbackTitleEn: string;
  fallbackDescKo: string;
  fallbackDescEn: string;
};

interface PointPromotionOrderFormProps {
  /** null = 잔액 확인 불가 → 신청 비활성, "—" 표시 */
  balance: number | null;
  balanceLoading?: boolean;
  productOptions: { id: string; title: string }[];
  /** Deep-link from My Trade — preselect listing */
  initialTargetId?: string | null;
  onSubmit: (values: PointPromotionOrderFormValues) => void;
  submitLabel?: string;
  /** 제출 중 — 버튼 비활성(중복 제출 방지, S43) */
  submitting?: boolean;
  /** 하단 고정 CTA(`MyStickyCta`)가 대신 제출할 때 — 폼 id + 폼 안 버튼 숨김 (S46 apply T3) */
  formId?: string;
  hideSubmitButton?: boolean;
  /** 제출 가능 여부 변화 — 바깥 고정 CTA 활성 상태 동기화 */
  onCanSubmitChange?: (canSubmit: boolean) => void;
  /** 바뀌면 카탈로그를 다시 읽는다 (서버가 price_changed 를 돌려줬을 때) */
  catalogRefreshKey?: number;
}

export function PointPromotionOrderForm({
  balance,
  balanceLoading = false,
  productOptions,
  initialTargetId = null,
  onSubmit,
  submitLabel,
  submitting = false,
  formId,
  hideSubmitButton = false,
  onCanSubmitChange,
  catalogRefreshKey = 0,
}: PointPromotionOrderFormProps) {
  const { t, language, safeT } = useI18n();
  /** null = 불러오는 중 · [] = 신청할 수 있는 상품 없음(모두 꺼짐) */
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [productId, setProductId] = useState<MemberPromotionProductId | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me/points/promotion-orders?catalog=1&domain=trade", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as { catalog?: CatalogItem[] };
        if (!cancelled) setCatalog(res.ok && Array.isArray(j.catalog) ? j.catalog : []);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogRefreshKey]);

  useEffect(() => {
    const want = (initialTargetId ?? "").trim();
    if (!want) return;
    if (!productOptions.some((p) => p.id === want)) return;
    setTargetId((prev) => (prev === want ? prev : want));
  }, [initialTargetId, productOptions]);

  const selected = catalog?.find((p) => p.id === productId) ?? catalog?.[0] ?? null;
  const cost = selected?.pointCost ?? 0;
  const insufficient = balance !== null && balance < cost;
  const submitText = submitLabel ?? t("promo_sheet_cta");

  const resolvedTargetId = targetId.trim() || productOptions[0]?.id || "";
  const targetTitle =
    productOptions.find((p) => p.id === resolvedTargetId)?.title ?? "";

  const canSubmit =
    !balanceLoading &&
    balance !== null &&
    Boolean(resolvedTargetId) &&
    productOptions.length > 0 &&
    Boolean(selected) &&
    !insufficient;

  useEffect(() => {
    onCanSubmitChange?.(canSubmit);
  }, [canSubmit, onCanSubmitChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selected || submitting) return;
    // 재감사 S-0 (X-1): 요청 키는 결제하는 화면이 같은 결제 시도마다 고정해 붙인다(`promotion-attempt-key`)
    onSubmit({
      targetType: "product",
      targetId: resolvedTargetId,
      targetTitle,
      productId: selected.id,
      expectedPointCost: selected.pointCost,
      expectedDurationDays: selected.durationDays,
    });
  };

  const langEn = language === "en";

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("points_ui_select_product")}
        </label>
        {productOptions.length === 0 ? (
          <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-muted">
            {t("points_ui_no_products")}
          </p>
        ) : (
          <select
            value={resolvedTargetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
          >
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2">
        <p className="sam-text-body font-medium text-sam-fg">{t("promo_sheet_title")}</p>
        {catalog === null ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("common_loading")}</p>
        ) : catalog.length === 0 ? (
          <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-muted">
            {safeT("promo_no_active_products")}
          </p>
        ) : null}
        {(catalog ?? []).map((item) => {
          const title = langEn ? item.fallbackTitleEn : item.fallbackTitleKo;
          const desc = langEn ? item.fallbackDescEn : item.fallbackDescKo;
          const on = item.id === selected?.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setProductId(item.id)}
              className={`w-full rounded-ui-rect border px-3 py-3 text-left ${
                on ? "border-sam-primary bg-sam-primary/5" : "border-sam-border bg-sam-app"
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-sam-fg">{title}</span>
                <CurrencyAmount
                  currency="point"
                  amount={item.pointCost}
                  compactPoint
                  className="font-semibold"
                />
              </div>
              <p className="mt-1 sam-text-helper text-sam-muted">{desc}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
        <p className="sam-text-body-secondary text-sam-muted">{t("points_ui_estimated_cost")}</p>
        <CurrencyAmount
          currency="point"
          amount={cost}
          compactPoint
          className="mt-1 sam-text-page-title font-semibold"
        />
        <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
          {t("points_ui_owned", { balance: balance === null ? "—" : formatMypageNumber(balance, { lang: language }) })}
        </p>
        {insufficient ? (
          <p className="mt-2 sam-text-body-secondary font-medium text-sam-danger">
            {t("points_ui_insufficient")}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        hidden={hideSubmitButton}
        disabled={!canSubmit || submitting}
        aria-busy={submitting}
        className="w-full rounded-ui-rect bg-signature py-3 sam-text-body font-medium text-sam-on-primary disabled:opacity-50"
      >
        {submitText}
      </button>
      {!canSubmit && insufficient ? (
        <Link
          href="/mypage/points/charge"
          className="flex min-h-11 items-center justify-center sam-text-body font-medium text-sam-primary"
        >
          {safeT("promo_sheet_go_points")}
        </Link>
      ) : null}
    </form>
  );
}
