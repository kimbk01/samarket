"use client";

import { useState, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { PointPromotionPlacement } from "@/lib/types/point";
import { getPointCostForPromotion } from "@/lib/points/promotion-point-cost";

const PLACEMENTS: PointPromotionPlacement[] = [
  "home_top",
  "home_middle",
  "search_top",
  "shop_featured",
];

const PLACEMENT_KEYS: Record<PointPromotionPlacement, MessageKey> = {
  home_top: "point_placement_home_top",
  home_middle: "point_placement_home_middle",
  search_top: "point_placement_search_top",
  shop_featured: "point_placement_shop_featured",
};

const DURATION_OPTIONS = [7, 14];

export interface PointPromotionOrderFormValues {
  targetType: "product" | "shop";
  targetId: string;
  targetTitle: string;
  placement: PointPromotionPlacement;
  durationDays: number;
}

interface PointPromotionOrderFormProps {
  balance: number;
  balanceLoading?: boolean;
  productOptions: { id: string; title: string }[];
  shopOptions: { id: string; shopName: string }[];
  onSubmit: (values: PointPromotionOrderFormValues) => void;
  submitLabel?: string;
}

export function PointPromotionOrderForm({
  balance,
  balanceLoading = false,
  productOptions,
  shopOptions,
  onSubmit,
  submitLabel,
}: PointPromotionOrderFormProps) {
  const { t } = useI18n();
  const [targetType, setTargetType] = useState<"product" | "shop">("product");
  const [targetId, setTargetId] = useState("");
  const [placement, setPlacement] = useState<PointPromotionPlacement>("home_top");
  const [durationDays, setDurationDays] = useState(7);

  const cost = useMemo(
    () => getPointCostForPromotion(placement, durationDays),
    [placement, durationDays]
  );
  const insufficient = balance < cost;
  const submitText = submitLabel ?? t("points_ui_apply_with_points");

  const activeOptions = targetType === "product" ? productOptions : shopOptions;
  const resolvedTargetId = targetId.trim() || activeOptions[0]?.id || "";
  const targetTitle =
    targetType === "product"
      ? productOptions.find((p) => p.id === resolvedTargetId)?.title ?? ""
      : shopOptions.find((s) => s.id === resolvedTargetId)?.shopName ?? "";

  const canSubmit =
    !balanceLoading &&
    Boolean(resolvedTargetId) &&
    activeOptions.length > 0 &&
    !insufficient;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      targetType,
      targetId: resolvedTargetId,
      targetTitle,
      placement,
      durationDays,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("points_ui_target_type")}
        </label>
        <select
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value as "product" | "shop");
            setTargetId("");
          }}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
        >
          <option value="product">{t("points_ui_product")}</option>
          <option value="shop">{t("points_ui_shop")}</option>
        </select>
      </div>

      {targetType === "product" && (
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
      )}

      {targetType === "shop" && (
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            {t("points_ui_select_shop")}
          </label>
          {shopOptions.length === 0 ? (
            <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-muted">
              {t("points_ui_no_shops")}
            </p>
          ) : (
            <select
              value={resolvedTargetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
            >
              {shopOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shopName}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("points_ui_placement")}
        </label>
        <select
          value={placement}
          onChange={(e) => setPlacement(e.target.value as PointPromotionPlacement)}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
        >
          {PLACEMENTS.map((p) => (
            <option key={p} value={p}>
              {t(PLACEMENT_KEYS[p])}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("points_ui_duration")}
        </label>
        <select
          value={durationDays}
          onChange={(e) => setDurationDays(Number(e.target.value))}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body text-sam-fg"
        >
          {DURATION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {t("points_ui_days", { days: d })}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
        <p className="sam-text-body-secondary text-sam-muted">{t("points_ui_estimated_cost")}</p>
        <p className="mt-1 sam-text-page-title font-semibold text-sam-fg">
          {cost.toLocaleString()}P
        </p>
        <p className="mt-0.5 sam-text-body-secondary text-sam-muted">
          {t("points_ui_owned", { balance: balance.toLocaleString() })}
        </p>
        {insufficient && (
          <p className="mt-2 sam-text-body-secondary font-medium text-red-600">
            {t("points_ui_insufficient")}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-ui-rect bg-signature py-3 sam-text-body font-medium text-white disabled:opacity-50"
      >
        {submitText}
      </button>
    </form>
  );
}
