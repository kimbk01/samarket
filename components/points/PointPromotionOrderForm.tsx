"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  listActiveMemberPromotionProducts,
  type MemberPromotionProductId,
} from "@/lib/points/promotion-products";

export interface PointPromotionOrderFormValues {
  targetType: "product";
  targetId: string;
  targetTitle: string;
  productId: MemberPromotionProductId;
  idempotencyKey?: string;
}

interface PointPromotionOrderFormProps {
  balance: number;
  balanceLoading?: boolean;
  productOptions: { id: string; title: string }[];
  /** Deep-link from My Trade — preselect listing */
  initialTargetId?: string | null;
  onSubmit: (values: PointPromotionOrderFormValues) => void;
  submitLabel?: string;
}

export function PointPromotionOrderForm({
  balance,
  balanceLoading = false,
  productOptions,
  initialTargetId = null,
  onSubmit,
  submitLabel,
}: PointPromotionOrderFormProps) {
  const { t, language, safeT } = useI18n();
  const catalog = useMemo(() => listActiveMemberPromotionProducts(), []);
  const [targetId, setTargetId] = useState("");
  const [productId, setProductId] = useState<MemberPromotionProductId>(
    catalog[0]?.id ?? "trade_promote_7"
  );

  useEffect(() => {
    const want = (initialTargetId ?? "").trim();
    if (!want) return;
    if (!productOptions.some((p) => p.id === want)) return;
    setTargetId((prev) => (prev === want ? prev : want));
  }, [initialTargetId, productOptions]);

  const selected = catalog.find((p) => p.id === productId) ?? catalog[0];
  const cost = selected?.pointCost ?? 0;
  const insufficient = balance < cost;
  const submitText = submitLabel ?? t("promo_sheet_cta");

  const resolvedTargetId = targetId.trim() || productOptions[0]?.id || "";
  const targetTitle =
    productOptions.find((p) => p.id === resolvedTargetId)?.title ?? "";

  const canSubmit =
    !balanceLoading &&
    Boolean(resolvedTargetId) &&
    productOptions.length > 0 &&
    Boolean(selected) &&
    !insufficient;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selected) return;
    const idem =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `promo-${Date.now()}`;
    onSubmit({
      targetType: "product",
      targetId: resolvedTargetId,
      targetTitle,
      productId: selected.id,
      idempotencyKey: idem,
    });
  };

  const langEn = language === "en";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        {catalog.map((item) => {
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
                <span className="font-semibold text-sam-fg">{item.pointCost.toLocaleString()}P</span>
              </div>
              <p className="mt-1 sam-text-helper text-sam-muted">{desc}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
        <p className="sam-text-body-secondary text-sam-muted">{t("points_ui_estimated_cost")}</p>
        <p className="mt-1 sam-text-page-title font-semibold text-sam-fg">
          {cost.toLocaleString()}P
        </p>
        <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
          {t("points_ui_owned", { balance: balance.toLocaleString() })}
        </p>
        {insufficient ? (
          <p className="mt-2 sam-text-body-secondary font-medium text-red-600">
            {t("points_ui_insufficient")}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-ui-rect bg-signature py-3 sam-text-body font-medium text-white disabled:opacity-50"
      >
        {submitText}
      </button>
      {!canSubmit && insufficient ? (
        <a href="/mypage/points" className="block text-center sam-text-body text-sam-primary">
          {safeT("promo_sheet_go_points", {
            fallbackKo: "D-Point 충전",
            fallbackEn: "Add D-Point",
          })}
        </a>
      ) : null}
    </form>
  );
}
