import { STORES_LIST_PRESENTATION_SSOT } from "@/lib/stores/presentation/stores-list-presentation-ssot";

export type StoreListCardBadgeKind =
  | "status"
  | "recommended"
  | "free_delivery"
  | "out_of_range";

export type StoreListCardBadge = {
  kind: StoreListCardBadgeKind;
  label: string;
  className: string;
};

export type ResolveStoreListCardBadgesInput = {
  statusLabel: string;
  statusClassName: string;
  /** `isFeatured` — discount 아님. 추천 semantic만. */
  isFeatured: boolean;
  recommendedLabel: string;
  /** fee authority가 free를 증명한 경우에만 true */
  freeDeliveryProven: boolean;
  freeDeliveryLabel: string;
  outOfRangeLabel: string | null;
};

/**
 * List-card badge semantic resolver — 단일 authority.
 * - isFeatured → recommended only (instant discount 금지)
 * - delivery/pickup 상시 decorative badge 금지
 * - payment methods 제외
 */
export function resolveStoreListCardBadges(
  input: ResolveStoreListCardBadgesInput
): StoreListCardBadge[] {
  const out: StoreListCardBadge[] = [
    {
      kind: "status",
      label: input.statusLabel,
      className: input.statusClassName,
    },
  ];

  if (input.isFeatured) {
    out.push({
      kind: "recommended",
      label: input.recommendedLabel,
      className: "bg-sam-warning-soft text-sam-warning",
    });
  }

  if (input.freeDeliveryProven) {
    out.push({
      kind: "free_delivery",
      label: input.freeDeliveryLabel,
      className: "bg-sam-success-soft text-sam-success",
    });
  }

  if (input.outOfRangeLabel) {
    out.push({
      kind: "out_of_range",
      label: input.outOfRangeLabel,
      className: "bg-sam-warning-soft text-sam-warning",
    });
  }

  return out.slice(0, STORES_LIST_PRESENTATION_SSOT.badgeMaxVisible);
}
