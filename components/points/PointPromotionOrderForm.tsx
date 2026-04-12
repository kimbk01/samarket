"use client";

import { useState, useMemo } from "react";
import type { PointPromotionPlacement } from "@/lib/types/point";
import { getPointCostForPromotion } from "@/lib/points/mock-point-promotion-orders";
import { getUserPointBalance } from "@/lib/points/mock-point-ledger";
import { POINT_PROMOTION_PLACEMENT_LABELS } from "@/lib/points/point-utils";

const PLACEMENTS: PointPromotionPlacement[] = [
  "home_top",
  "home_middle",
  "search_top",
  "shop_featured",
];
const DURATION_OPTIONS = [7, 14];

export interface PointPromotionOrderFormValues {
  targetType: "product" | "shop";
  targetId: string;
  targetTitle: string;
  placement: PointPromotionPlacement;
  durationDays: number;
}

interface PointPromotionOrderFormProps {
  userId: string;
  productOptions: { id: string; title: string }[];
  shopOptions: { id: string; shopName: string }[];
  onSubmit: (values: PointPromotionOrderFormValues) => void;
  submitLabel?: string;
}

export function PointPromotionOrderForm({
  userId,
  productOptions,
  shopOptions,
  onSubmit,
  submitLabel = "포인트로 신청",
}: PointPromotionOrderFormProps) {
  const [targetType, setTargetType] = useState<"product" | "shop">("product");
  const [targetId, setTargetId] = useState("");
  const [placement, setPlacement] = useState<PointPromotionPlacement>("home_top");
  const [durationDays, setDurationDays] = useState(7);

  const balance = getUserPointBalance(userId);
  const cost = useMemo(
    () => getPointCostForPromotion(placement, durationDays),
    [placement, durationDays]
  );
  const insufficient = balance < cost;

  const targetTitle =
    targetType === "product"
      ? productOptions.find((p) => p.id === targetId)?.title ?? ""
      : shopOptions.find((s) => s.id === targetId)?.shopName ?? "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (insufficient) return;
    onSubmit({
      targetType,
      targetId: targetId || (targetType === "product" ? productOptions[0]?.id : shopOptions[0]?.id) || "",
      targetTitle:
        targetTitle ||
        (targetType === "product" ? productOptions[0]?.title : shopOptions[0]?.shopName) ||
        "",
      placement,
      durationDays,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          대상 유형
        </label>
        <select
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value as "product" | "shop");
            setTargetId("");
          }}
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] text-sam-fg"
        >
          <option value="product">상품</option>
          <option value="shop">상점</option>
        </select>
      </div>

      {targetType === "product" && (
        <div>
          <label className="mb-1 block text-[14px] font-medium text-sam-fg">
            상품 선택
          </label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] text-sam-fg"
          >
            <option value="">선택</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {targetType === "shop" && (
        <div>
          <label className="mb-1 block text-[14px] font-medium text-sam-fg">
            상점 선택
          </label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] text-sam-fg"
          >
            <option value="">선택</option>
            {shopOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shopName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          노출 위치
        </label>
        <select
          value={placement}
          onChange={(e) =>
            setPlacement(e.target.value as PointPromotionPlacement)
          }
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] text-sam-fg"
        >
          {PLACEMENTS.map((p) => (
            <option key={p} value={p}>
              {POINT_PROMOTION_PLACEMENT_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          노출 기간
        </label>
        <select
          value={durationDays}
          onChange={(e) =>
            setDurationDays(Number(e.target.value))
          }
          className="w-full rounded-ui-rect border border-sam-border px-3 py-2.5 text-[14px] text-sam-fg"
        >
          {DURATION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}일
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
        <p className="text-[13px] text-sam-muted">예상 차감 포인트</p>
        <p className="mt-1 text-[18px] font-semibold text-sam-fg">
          {cost.toLocaleString()}P
        </p>
        <p className="mt-0.5 text-[13px] text-sam-muted">
          보유 {balance.toLocaleString()}P
        </p>
        {insufficient && (
          <p className="mt-2 text-[13px] font-medium text-red-600">
            포인트가 부족합니다.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={insufficient}
        className="w-full rounded-ui-rect bg-signature py-3 text-[15px] font-medium text-white disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
